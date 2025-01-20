/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

const RE_YOUTUBE = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';
const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
class YoutubeTranscriptError extends Error {
    constructor(message) {
        super(`[YoutubeTranscript] 🚨 ${message}`);
    }
}
class YoutubeTranscriptTooManyRequestError extends YoutubeTranscriptError {
    constructor() {
        super('YouTube is receiving too many requests from this IP and now requires solving a captcha to continue');
    }
}
class YoutubeTranscriptVideoUnavailableError extends YoutubeTranscriptError {
    constructor(videoId) {
        super(`The video is no longer available (${videoId})`);
    }
}
class YoutubeTranscriptDisabledError extends YoutubeTranscriptError {
    constructor(videoId) {
        super(`Transcript is disabled on this video (${videoId})`);
    }
}
class YoutubeTranscriptNotAvailableError extends YoutubeTranscriptError {
    constructor(videoId) {
        super(`No transcripts are available for this video (${videoId})`);
    }
}
class YoutubeTranscriptNotAvailableLanguageError extends YoutubeTranscriptError {
    constructor(lang, availableLangs, videoId) {
        super(`No transcripts are available in ${lang} this video (${videoId}). Available languages: ${availableLangs.join(', ')}`);
    }
}
function convertViewCount(viewCount) {
    if (!viewCount) {
        return 0;
    }
    const cleaned = viewCount.replace(/[^\d.]/g, '');
    return parseInt(cleaned.replace(/\./g, ''), 10);
}
/**
 * Class to retrieve transcript if exist
 */
class YoutubeTranscript {
    /**
     * Fetch transcript from YTB Video
     * @param videoId Video url or video identifier
     * @param config Get transcript in a specific language ISO
     */
    static fetchTranscript(videoId, config) {
        return __awaiter(this, void 0, void 0, function* () {
            const videoTrack = yield this.fetchVideoInfo(videoId, config);
            const captionTracks = videoTrack.captionTracks;
            if ((config === null || config === void 0 ? void 0 : config.lang) &&
                !captionTracks.some((track) => track.languageCode === (config === null || config === void 0 ? void 0 : config.lang))) {
                throw new YoutubeTranscriptNotAvailableLanguageError(config === null || config === void 0 ? void 0 : config.lang, captionTracks.map((track) => track.languageCode), videoId);
            }
            const transcriptURL = ((config === null || config === void 0 ? void 0 : config.lang)
                ? captionTracks.find((track) => track.languageCode === (config === null || config === void 0 ? void 0 : config.lang))
                : captionTracks[0]).baseUrl;
            const transcript = yield this.getTranscript(transcriptURL);
            return {
                videoDetails: videoTrack.videoDetails,
                transcript: transcript,
                relatedVideos: videoTrack.relatedVideos,
            };
        });
    }
    static getTranscript(transcriptURL) {
        return __awaiter(this, void 0, void 0, function* () {
            const transcriptResponse = yield fetch(transcriptURL, {
                headers: {
                    'User-Agent': USER_AGENT,
                },
            });
            const params = new URLSearchParams(new URL(transcriptURL).search);
            if (!transcriptResponse.ok) {
                throw new YoutubeTranscriptNotAvailableError(params.get("v"));
            }
            const transcriptBody = yield transcriptResponse.text();
            const results = [...transcriptBody.matchAll(RE_XML_TRANSCRIPT)];
            return results.map((result) => ({
                text: result[3],
                duration: parseFloat(result[2]),
                offset: parseFloat(result[1]),
                lang: params.get("lang"),
            }));
        });
    }
    static fetchVideoInfo(videoId, config) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const identifier = this.retrieveVideoId(videoId);
            const videoPageResponse = yield fetch(`https://www.youtube.com/watch?v=${identifier}`, {
                headers: Object.assign(Object.assign({}, ((config === null || config === void 0 ? void 0 : config.lang) && { 'Accept-Language': config.lang })), { 'User-Agent': USER_AGENT }),
            });
            const videoPageBody = yield videoPageResponse.text();
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
                return { videoDetails, captionTracks: [], relatedVideos };
            }
            const captions = (_a = (() => {
                try {
                    return JSON.parse(splittedHTML[1].split(',"videoDetails')[0].replace('\n', ''));
                }
                catch (e) {
                    return undefined;
                }
            })()) === null || _a === void 0 ? void 0 : _a['playerCaptionsTracklistRenderer'];
            if (!captions) {
                return { videoDetails, captionTracks: [], relatedVideos: relatedVideos };
            }
            if (!('captionTracks' in captions)) {
                throw new YoutubeTranscriptNotAvailableError(videoId);
            }
            return { videoDetails, captionTracks: captions.captionTracks, relatedVideos: relatedVideos };
        });
    }
    static getRelatedVideos(videoPageBody, videoId) {
        var _a, _b;
        const data = this.getTwoColumnWatchNextResults(videoPageBody);
        if (!data)
            return [];
        if (!((_b = (_a = data === null || data === void 0 ? void 0 : data.secondaryResults) === null || _a === void 0 ? void 0 : _a.secondaryResults) === null || _b === void 0 ? void 0 : _b.results))
            return [];
        return data
            .secondaryResults
            .secondaryResults
            .results
            .filter(item => item.compactVideoRenderer && item.compactVideoRenderer.videoId !== videoId)
            .map(item => item.compactVideoRenderer)
            .map((item) => {
            var _a, _b;
            return ({
                videoId: item.videoId,
                title: item.title.simpleText,
                thumbnailUrl: item.thumbnail.thumbnails[item.thumbnail.thumbnails.length - 1].url,
                lengthText: (_b = (_a = item.lengthText) === null || _a === void 0 ? void 0 : _a.simpleText) !== null && _b !== void 0 ? _b : "00:00",
                channelThumbnailUrl: item.channelThumbnail.thumbnails[0].url,
                viewCount: convertViewCount(item.viewCountText.simpleText),
                channelId: item.longBylineText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url,
                channelText: item.longBylineText.runs[0].text,
            });
        });
    }
    static getTwoColumnWatchNextResults(videoPageBody) {
        const stringStart = '"twoColumnWatchNextResults":';
        const stringFinish = '},"currentVideoEndpoint":';
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
    static retrieveVideoId(videoId) {
        if (videoId.length === 11) {
            return videoId;
        }
        const matchId = videoId.match(RE_YOUTUBE);
        if (matchId && matchId.length) {
            return matchId[1];
        }
        throw new YoutubeTranscriptError('Impossible to retrieve Youtube video ID.');
    }
    static getVideoDetails(videoPageBody) {
        var _a;
        const data = this.getTwoColumnWatchNextResults(videoPageBody);
        if (!data)
            return undefined;
        const contents = data.results.results.contents;
        const videoSecondaryInfoRenderer = (_a = contents.find(item => !!item.videoSecondaryInfoRenderer)) === null || _a === void 0 ? void 0 : _a.videoSecondaryInfoRenderer;
        if (!videoSecondaryInfoRenderer)
            return undefined;
        return {
            title: contents.find(item => !!item.videoPrimaryInfoRenderer)
                .videoPrimaryInfoRenderer.title.runs[0].text,
            desc: videoSecondaryInfoRenderer.attributedDescription.content,
            ownerName: videoSecondaryInfoRenderer.owner.videoOwnerRenderer.title.runs[0].text,
            ownerUrl: videoSecondaryInfoRenderer.owner.videoOwnerRenderer.title.runs[0].
                navigationEndpoint.commandMetadata.webCommandMetadata.url,
        };
    }
}

export { YoutubeTranscript, YoutubeTranscriptDisabledError, YoutubeTranscriptError, YoutubeTranscriptNotAvailableError, YoutubeTranscriptNotAvailableLanguageError, YoutubeTranscriptTooManyRequestError, YoutubeTranscriptVideoUnavailableError };
