import { BlendState } from "./blend-state.js";
const _noWrite = new BlendState();
const _caches = [];
function getSingleAttachmentBlendState(blendState, attachmentCount) {
  if (blendState.hasAttachmentOverrides) {
    return blendState;
  }
  const cache = _caches[attachmentCount] ?? (_caches[attachmentCount] = /* @__PURE__ */ new Map());
  const key = blendState.key;
  let masked = cache.get(key);
  if (!masked) {
    _noWrite.copy(blendState);
    _noWrite.setColorWrite(false, false, false, false);
    masked = blendState.clone();
    for (let i = 1; i < attachmentCount; i++) {
      masked.setAttachment(i, _noWrite);
    }
    cache.set(key, masked);
  }
  return masked;
}
export {
  getSingleAttachmentBlendState
};
