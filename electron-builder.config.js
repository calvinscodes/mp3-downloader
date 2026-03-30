module.exports = {
  appId: 'com.personal.wavdrop',
  productName: 'Wavdrop',
  mac: {
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] }
    ],
    category: 'public.app-category.music',
    icon: 'assets/icon.icns'
  },
  // Publish to GitHub Releases for auto-updates
  publish: {
    provider: 'github',
    owner: 'calvinscodes',
    repo: 'mp3-downloader'
  },
  extraResources: [
    { from: 'resources/yt-dlp', to: 'yt-dlp' },
    { from: 'resources/ffmpeg', to: 'ffmpeg' }
  ],
  files: [
    'dist/**/*',
    'electron/**/*',
    'package.json'
  ]
}
