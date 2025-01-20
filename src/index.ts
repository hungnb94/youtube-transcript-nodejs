const RE_YOUTUBE =
  /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';
const RE_XML_TRANSCRIPT =
  /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

export class YoutubeTranscriptError extends Error {
  constructor(message) {
    super(`[YoutubeTranscript] 🚨 ${message}`);
  }
}

export class YoutubeTranscriptTooManyRequestError extends YoutubeTranscriptError {
  constructor() {
    super(
      'YouTube is receiving too many requests from this IP and now requires solving a captcha to continue'
    );
  }
}

export class YoutubeTranscriptVideoUnavailableError extends YoutubeTranscriptError {
  constructor(videoId: string) {
    super(`The video is no longer available (${videoId})`);
  }
}

export class YoutubeTranscriptDisabledError extends YoutubeTranscriptError {
  constructor(videoId: string) {
    super(`Transcript is disabled on this video (${videoId})`);
  }
}

export class YoutubeTranscriptNotAvailableError extends YoutubeTranscriptError {
  constructor(videoId: string) {
    super(`No transcripts are available for this video (${videoId})`);
  }
}

export class YoutubeTranscriptNotAvailableLanguageError extends YoutubeTranscriptError {
  constructor(lang: string, availableLangs: string[], videoId: string) {
    super(
      `No transcripts are available in ${lang} this video (${videoId}). Available languages: ${availableLangs.join(
        ', '
      )}`
    );
  }
}

export interface TranscriptConfig {
  lang?: string;
}

export interface CaptionTrack {
  baseUrl: string;
  vssId: string;
  languageCode: string;
  kind?: string;
  isTranslatable: boolean;
}

export interface RelatedVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  lengthText: string;
  channelThumbnailUrl: string;
  viewCount: number;
  channelId: string;
  channelText: string;
}

export interface VideoDetails {
  title: string;
  desc: string;
  ownerName: string;
  ownerUrl: string;
}

export interface VideoInfo {
  videoDetails: VideoDetails;
  captionTracks: CaptionTrack[];
  relatedVideos: RelatedVideo[];
}

export interface TranscriptResponse {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
}

export interface VideoTranscript {
  videoDetails: VideoDetails;
  transcript: TranscriptResponse[];
  relatedVideos: RelatedVideo[];
}

function convertViewCount(viewCount?: string): number {
  if (!viewCount) { return 0; }
  const cleaned = viewCount.replace(/[^\d.]/g, '');
  return parseInt(cleaned.replace(/\./g, ''), 10);
}

/**
 * Class to retrieve transcript if exist
 */
export class YoutubeTranscript {
  /**
   * Fetch transcript from YTB Video
   * @param videoId Video url or video identifier
   * @param config Get transcript in a specific language ISO
   */
  public static async fetchTranscript(
    videoId: string,
    config?: TranscriptConfig
  ): Promise<VideoTranscript> {
    const videoTrack = await this.fetchVideoInfo(videoId, config);
    const captionTracks = videoTrack.captionTracks;

    if (
      config?.lang &&
      !captionTracks.some(
        (track) => track.languageCode === config?.lang
      )
    ) {
      throw new YoutubeTranscriptNotAvailableLanguageError(
        config?.lang,
        captionTracks.map((track) => track.languageCode),
        videoId
      );
    }

    const transcriptURL = (
      config?.lang
        ? captionTracks.find(
            (track) => track.languageCode === config?.lang
          )
        : captionTracks[0]
    ).baseUrl;

    const transcript = await this.getTranscript(transcriptURL);
    return {
      videoDetails: videoTrack.videoDetails,
      transcript: transcript,
      relatedVideos: videoTrack.relatedVideos,
    }
  }

  public static async getTranscript(transcriptURL: string): Promise<TranscriptResponse[]> {
    const transcriptResponse = await fetch(transcriptURL, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    const params = new URLSearchParams(new URL(transcriptURL).search);
    if (!transcriptResponse.ok) {
      throw new YoutubeTranscriptNotAvailableError(params.get("v"));
    }
    const transcriptBody = await transcriptResponse.text();
    const results = [...transcriptBody.matchAll(RE_XML_TRANSCRIPT)];
    return results.map((result) => ({
      text: result[3],
      duration: parseFloat(result[2]),
      offset: parseFloat(result[1]),
      lang: params.get("lang"),
    }));
  }

  public static async fetchVideoInfo(videoId: string, config?: TranscriptConfig): Promise<VideoInfo> {
    const identifier = this.retrieveVideoId(videoId);
    const videoPageResponse = await fetch(
        `https://www.youtube.com/watch?v=${identifier}`,
        {
          headers: {
            ...(config?.lang && {'Accept-Language': config.lang}),
            'User-Agent': USER_AGENT,
          },
        }
    );
    const videoPageBody = await videoPageResponse.text();

    const videoDetails = this.getVideoDetails(videoPageBody);
    const relatedVideos = this.getRelatedVideos(videoPageBody, videoId);
    const splittedHTML = videoPageBody.split('"captions":');

    if (splittedHTML.length <= 1) {
      if (videoPageBody.includes('class="g-recaptcha"')) {
        throw new YoutubeTranscriptTooManyRequestError();
      }
      if (!videoPageBody.includes('"playabilityStatus":')) {
        throw new YoutubeTranscriptVideoUnavailableError(videoId);
      }
      return { videoDetails, captionTracks: [], relatedVideos }
    }

    const captions = (() => {
      try {
        return JSON.parse(
            splittedHTML[1].split(',"videoDetails')[0].replace('\n', '')
        );
      } catch (e) {
        return undefined;
      }
    })()?.['playerCaptionsTracklistRenderer'];

    if (!captions) {
      return { videoDetails, captionTracks: [], relatedVideos: relatedVideos };
    }

    if (!('captionTracks' in captions)) {
      throw new YoutubeTranscriptNotAvailableError(videoId);
    }
    return { videoDetails, captionTracks: captions.captionTracks, relatedVideos: relatedVideos };
  }

  private static getRelatedVideos(videoPageBody: string, videoId: string): RelatedVideo[] {
    const data = this.getTwoColumnWatchNextResults(videoPageBody)
    if (!data) return [];
    if (!data?.secondaryResults?.secondaryResults?.results) return [];
    return data
        .secondaryResults
        .secondaryResults
        .results
        .filter(item => item.compactVideoRenderer && item.compactVideoRenderer.videoId !== videoId)
        .map(item => item.compactVideoRenderer)
        .map((item) => ({
          videoId: item.videoId,
          title: item.title.simpleText,
          thumbnailUrl: item.thumbnail.thumbnails[item.thumbnail.thumbnails.length - 1].url,
          lengthText: item.lengthText?.simpleText ?? "00:00",
          channelThumbnailUrl: item.channelThumbnail.thumbnails[0].url,
          viewCount: convertViewCount(item.viewCountText.simpleText),
          channelId: item.longBylineText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url,
          channelText: item.longBylineText.runs[0].text,
        }));
  }

  private static getTwoColumnWatchNextResults(videoPageBody: string): any {
    const stringStart = '"twoColumnWatchNextResults":'
    const stringFinish = '},"currentVideoEndpoint":'
    const indexStart = videoPageBody.indexOf(stringStart);
    const indexFinish = videoPageBody.indexOf(stringFinish, indexStart);
    if (indexStart < 0 || indexFinish < 0) {
      return undefined;
    }
    return JSON.parse(videoPageBody.substring(indexStart + stringStart.length, indexFinish));
  }

  /**
   * Retrieve video id from url or string
   * @param videoId video url or video id
   */
  private static retrieveVideoId(videoId: string) {
    if (videoId.length === 11) {
      return videoId;
    }
    const matchId = videoId.match(RE_YOUTUBE);
    if (matchId && matchId.length) {
      return matchId[1];
    }
    throw new YoutubeTranscriptError(
      'Impossible to retrieve Youtube video ID.'
    );
  }

  private static getVideoDetails(videoPageBody: string): VideoDetails {
    const data = this.getTwoColumnWatchNextResults(videoPageBody);
    if (!data) return undefined;
    const contents = data.results.results.contents;
    const videoSecondaryInfoRenderer = contents.find(item => !!item.videoSecondaryInfoRenderer)
        ?.videoSecondaryInfoRenderer;
    if (!videoSecondaryInfoRenderer) return undefined;
    return {
      title: contents.find(item => !!item.videoPrimaryInfoRenderer)
          .videoPrimaryInfoRenderer.title.runs[0].text,
      desc: videoSecondaryInfoRenderer.attributedDescription.content,
      ownerName: videoSecondaryInfoRenderer.owner.videoOwnerRenderer.title.runs[0].text,
      ownerUrl: videoSecondaryInfoRenderer.owner.videoOwnerRenderer.title.runs[0].
          navigationEndpoint.commandMetadata.webCommandMetadata.url,
    }
  }
}
