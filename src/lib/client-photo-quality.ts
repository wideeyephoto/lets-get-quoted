/**
 * Fast client-side image health check using HTML5 canvas.
 * Analyzes brightness (luminance) and sharpness (edge contrast) to flag
 * photos that are too dark or blurry before submission.
 */

export type PhotoQualityResult = {
  isDark: boolean;
  isBlurry: boolean;
  tip: string | null;
};

export async function assessImageQuality(file: File): Promise<PhotoQualityResult> {
  // Only evaluate image files
  if (!file.type.startsWith('image/')) {
    return { isDark: false, isBlurry: false, tip: null };
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      try {
        const canvas = document.createElement('canvas');
        const size = 100; // Small thumbnail is plenty for luminance and gradient variance
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          return resolve({ isDark: false, isBlurry: false, tip: null });
        }

        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;

        let totalLuminance = 0;
        const grayscale = new Float32Array(size * size);

        // 1. Calculate pixel luminance: Y = 0.299R + 0.587G + 0.114B
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          totalLuminance += lum;
          grayscale[p] = lum;
        }

        const avgLuminance = totalLuminance / (size * size);
        const isDark = avgLuminance < 36; // 0 (pure black) to 255 (pure white)

        // 2. Simple Sobel / gradient energy measure for sharpness
        let edgeEnergy = 0;
        let edgeCount = 0;

        for (let y = 1; y < size - 1; y++) {
          for (let x = 1; x < size - 1; x++) {
            const idx = y * size + x;
            const dx = Math.abs(grayscale[idx + 1] - grayscale[idx - 1]);
            const dy = Math.abs(grayscale[idx + size] - grayscale[idx - size]);
            edgeEnergy += dx + dy;
            edgeCount++;
          }
        }

        const avgEdgeGradient = edgeEnergy / edgeCount;
        // Natural sharp images have strong gradients (> 14), blurred/blank images have very low (< 7)
        const isBlurry = avgEdgeGradient < 7.5 && avgLuminance > 20;

        let tip: string | null = null;
        if (isDark && isBlurry) {
          tip = '💡 Photo looks dark and blurry — taking another with flash on will help us give you an exact estimate!';
        } else if (isDark) {
          tip = '💡 Photo looks a bit dark — turning on flash or good lighting helps get a tighter estimate!';
        } else if (isBlurry) {
          tip = '💡 Photo looks a bit blurry — holding steady or tapping to focus helps get a tighter estimate!';
        }

        resolve({ isDark, isBlurry, tip });
      } catch {
        resolve({ isDark: false, isBlurry: false, tip: null });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ isDark: false, isBlurry: false, tip: null });
    };

    img.src = objectUrl;
  });
}
