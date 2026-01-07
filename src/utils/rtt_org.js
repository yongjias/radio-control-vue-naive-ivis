function chunk(arr, size) {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    );
}

function race(ips, maxTime) {
    return new Promise((resolve) => {
        const controller = new AbortController();
        const { signal } = controller;
        setTimeout(() => {
            controller.abort();
            resolve(null);
        }, maxTime);
        let startTime = Date.now();
        for (const ip of ips) {
            fetch(`https://${ip}:8080`, { signal }).then(() => {
                const rtt = Date.now() - startTime;
                resolve({ ip, rtt });
                // 取消其他请求
                controller.abort();
            });
        }
    });
}

async function getRTT(ips, parallelCount = 10) {
    let results = {
        ip: '',
        rtt: Infinity,
    };
    const chunks = chunk(ips, parallelCount);
    for (const chunk of chunks) {
        const temp = await race(chunk, results.rtt);
        if (temp) {
            results = temp;
        }
    }
    return results;
}
