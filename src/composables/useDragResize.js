export function useDragResize() {
  const windowStyle = reactive({
    maxWidth: '',
  });

   // performance improvement
   let isMouseMoveScheduled = false

  const startDrag = (e) => {
    //if (e.button === 0 && !(e.target.closest('li'))) {
    if (e.button === 0 && !(e.target.tagName==='I') && !(e.target.parentNode.classList.contains('devBox'))) {
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
        windowStyle.maxWidth = '' + event.clientX + 'px';
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
    windowStyle,
    startDrag,
  };
}
