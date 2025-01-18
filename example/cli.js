const { YoutubeTranscript } = require('..');
YoutubeTranscript.fetchVideoInfo(process.argv[2])
  .then(console.log)
  .catch(console.error);
