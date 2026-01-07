function performTasks(tasks) {
    return new Promise((resolve) => {
        if (tasks.length === 0) {
            resolve();
            return;
        }
        let index = 0;
        function _run() {
            requestIdleCallback((idle) => {
                while (idle.timeRemaining() > 0 && index < tasks.length) {
                    tasks[index]();
                    index++;
                }
                if (index < tasks.length) {
                    _run();
                } else {
                    resolve();
                }
            })
        }
        _run();
    });
}

export { performTasks };