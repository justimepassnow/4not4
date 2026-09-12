// Load a separate image so a new reaction cannot interrupt an earlier decode.
export function loadReactionImage(url, createImage = () => new Image()) {
  return new Promise((resolve, reject) => {
    const image = createImage();
    const timer = setTimeout(() => finish(new Error('Image request timed out')), 15000);
    function finish(error) {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    }
    image.onload = () => image.naturalWidth > 0
      ? finish() : finish(new Error('Image is empty'));
    image.onerror = () => finish(new Error('Image request failed'));
    image.src = url;
    if (image.complete && image.naturalWidth > 0) finish();
  });
}
