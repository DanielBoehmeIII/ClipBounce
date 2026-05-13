import { extractReadableText } from '../clipbounce/extraction/extractReadableText';
import type { ContentScriptMessage } from '../clipbounce/messages';

chrome.runtime.onMessage.addListener((
  message: ContentScriptMessage,
  _sender,
  sendResponse,
) => {
  if (message.type === 'EXTRACT') {
    const content = extractReadableText(document);
    sendResponse(content);
    return true;
  }
  if (message.type === 'PING') {
    sendResponse({ alive: true });
    return true;
  }
});
