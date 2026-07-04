/**
 * Puppeteer configuration.
 *
 * Skip the Chrome browser download on `npm install`. Puppeteer is only used for
 * optional screenshot tooling here — the app runs without it — and the download
 * is large and frequently fails behind proxies/VPNs. Using Puppeteer's own config
 * file avoids the "Unknown npm config" warnings that an .npmrc entry produces.
 */
module.exports = {
  skipDownload: true,
};
