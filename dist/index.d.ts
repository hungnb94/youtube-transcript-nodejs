export declare class YoutubeTranscriptError extends Error {
    constructor(message: any);
}
export declare class YoutubeTranscriptTooManyRequestError extends YoutubeTranscriptError {
    constructor();
}
export declare class YoutubeTranscriptVideoUnavailableError extends YoutubeTranscriptError {
    constructor(videoId: string);
}
export declare class YoutubeTranscriptDisabledError extends YoutubeTranscriptError {
    constructor(videoId: string);
}
export declare class YoutubeTranscriptNotAvailableError extends YoutubeTranscriptError {
    constructor(videoId: string);
}
export declare class YoutubeTranscriptNotAvailableLanguageError extends YoutubeTranscriptError {
    constructor(lang: string, availableLangs: string[], videoId: string);
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
export interface VideoInfo {
    captionTracks: CaptionTrack[];
    relatedVideoIds: string[];
}
export interface TranscriptResponse {
    text: string;
    duration: number;
    offset: number;
    lang?: string;
}
export interface VideoTranscript {
    transcript: TranscriptResponse[];
    relatedVideoIds: string[];
}
/**
 * Class to retrieve transcript if exist
 */
export declare class YoutubeTranscript {
    /**
     * Fetch transcript from YTB Video
     * @param videoId Video url or video identifier
     * @param config Get transcript in a specific language ISO
     */
    static fetchTranscript(videoId: string, config?: TranscriptConfig): Promise<VideoTranscript>;
    static getTranscript(transcriptURL: string): Promise<TranscriptResponse[]>;
    static fetchVideoInfo(videoId: string, config?: TranscriptConfig): Promise<VideoInfo>;
    private static getVideoIds;
    /**
     * Retrieve video id from url or string
     * @param videoId video url or video id
     */
    private static retrieveVideoId;
}
