// 图片查看器：全屏 dialog 展示原图，多图时支持按钮与左右方向键切换。
import {showState} from "./helpers.js";

export function createViewer({
  elements: {imageViewer, imageViewerState, viewerPrev, viewerNext, viewerCounter},
  state}) {
  const img = imageViewer.querySelector("img");

  function openImageViewer(pics, index) {
    if (!pics || pics.length === 0) return;
    state.viewerImages = pics.map((p) => p.originalUrl || p.thumbnailUrl).filter(Boolean);
    if (state.viewerImages.length === 0) return;
    state.viewerIndex = Math.max(0, Math.min(index, state.viewerImages.length - 1));
    showViewerImage(state.viewerIndex);
    if (!imageViewer.open) imageViewer.showModal();
  }

  function showViewerImage(index) {
    const url = state.viewerImages[index];
    if (!url) return;
    showState(imageViewerState, "加载中…");
    img.hidden = true;
    img.onload = () => {
      img.hidden = false;
      showState(imageViewerState, "");
    };
    img.onerror = () => {
      img.hidden = true;
      showState(imageViewerState, "图片加载失败");
    };
    img.src = url;

    const hasMultiple = state.viewerImages.length > 1;
    viewerPrev.hidden = !hasMultiple;
    viewerNext.hidden = !hasMultiple;
    if (hasMultiple) {
      viewerCounter.hidden = false;
      viewerCounter.textContent = `${index + 1} / ${state.viewerImages.length}`;
    } else {
      viewerCounter.hidden = true;
    }
  }

  function showPrevImage() {
    if (state.viewerImages.length <= 1) return;
    state.viewerIndex = (state.viewerIndex - 1 + state.viewerImages.length) % state.viewerImages.length;
    showViewerImage(state.viewerIndex);
  }

  function showNextImage() {
    if (state.viewerImages.length <= 1) return;
    state.viewerIndex = (state.viewerIndex + 1) % state.viewerImages.length;
    showViewerImage(state.viewerIndex);
  }

  function closeImageViewer() {
    if (imageViewer.open) {
      imageViewer.close();
    }
  }

  imageViewer.addEventListener("click", (e) => {
    if (e.target === imageViewer) {
      closeImageViewer();
    }
  });

  viewerPrev.addEventListener("click", (e) => {
    e.stopPropagation();
    showPrevImage();
  });

  viewerNext.addEventListener("click", (e) => {
    e.stopPropagation();
    showNextImage();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (imageViewer.open) {
        closeImageViewer();
      }
      // 搜索浮层由原生 dialog 处理 Esc，无需额外逻辑
    } else if (imageViewer.open) {
      if (e.key === "ArrowLeft") {
        showPrevImage();
      } else if (e.key === "ArrowRight") {
        showNextImage();
      }
    }
  });

  return {openImageViewer};
}
