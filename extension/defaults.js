(() => {
  globalThis.BetterYouTube = Object.freeze({
    defaults: Object.freeze({ ads: true, distractions: true,
      pip: true, shorts: true, comments: true }),
    features: Object.freeze([
      ['ads', 'Quiet ads', 'Mute and cover ads. Try auto-skip, with a manual Skip fallback. Hide sponsored placements.'],
      ['distractions', 'No rabbit holes', 'Hide Up next, recommendations, end screens, cards and autoplay cues.'],
      ['pip', 'PiP resume recovery', 'Try to recover stalled playback when you resume Picture in Picture.'],
      ['shorts', 'No Shorts', 'Hide Shorts shelves, links, search results and the Shorts player.'],
      ['comments', 'No comments', 'Keep the conversation out of your viewing space.']
    ])
  });
})();
