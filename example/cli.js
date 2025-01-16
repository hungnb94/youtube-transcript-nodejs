const { YoutubeTranscript } = require('..');
YoutubeTranscript.fetchTranscript(process.argv[2])
  .then(console.log)
  .catch(console.error);
