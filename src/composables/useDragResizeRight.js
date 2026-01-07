export function useDragResizeRight() {
  const windowStyleRight = reactive({
    width: '',
  });

   // performance improvement
   let isMouseMoveScheduled = false

  const startDragRight = (e) => {
    if (e.button === 0 && !(e.target.closest('li'))) {
      // only apply left mouse pressed, and not inside 'li' dom
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', stopDrag);
      document.documentElement.style.cursor = 'col-resize'
    }
  };

  const onDrag = (event) => {
    if (!isMouseMoveScheduled) {
      isMouseMoveScheduled = true
      requestAnimationFrame(() => {
        event.preventDefault() // 阻止默认事件
        windowStyleRight.width = '' + (window.innerWidth - event.clientX) + 'px';
        // console.log(windowStyleRight.width,window.innerWidth, event.clientX)
        isMouseMoveScheduled = false
      });
    }
  }

  const stopDrag = () => {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.documentElement.style.cursor = 'default'
  };

  return {
    windowStyleRight,
    startDragRight,
  };
}
