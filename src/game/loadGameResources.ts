import type { Unzipped } from "fflate";
import type { UnzipReply } from "./unzip.worker";
import type { VcmiEngine } from "./loadEngine";

export const Source = `http://110.40.207.238`; // 游戏资源源域名


export async function loadGameResources(
    engine: VcmiEngine,
    url: string,
    onProgress: (message: string, percent?: number) => void,
    mod?: { id: string; prefix: string }
) {
    onProgress("正在下载游戏资源，请稍候……");

    // 拍平函数，zip 可能套着一个打包目录
    function getRelativePath(name: string) {
        if (!mod) {
            return name
        };

        return name.startsWith(mod.prefix)
            ? name.slice(mod.prefix.length)
            : "";
    }

    let packageCache: Cache | undefined;
    let cachedResponse: Response | undefined;

    try {
        packageCache = await caches.open("homm3-packages-v1");
        cachedResponse = await packageCache.match(url);
    } catch (error) {
        console.warn("读取资源缓存失败，将尝试网络下载：", error);
    }

    const packageName = mod ? `${mod.id} 模组包` : "基础游戏包";
    const readLabel = cachedResponse ? `正在读取缓存：${packageName}` : `正在下载：${packageName}`;

    console.log("开始加载资源包：", {
        packageName,
        url,
        fromCache: Boolean(cachedResponse),
    });

    onProgress(`${readLabel}，请稍候……`);
    const response = cachedResponse ?? await fetch(url);

    if (!response.ok) {
        throw new Error(`资源下载失败：HTTP ${response.status}`);
    }

    if (response.headers.get("content-type")?.includes("text/html")) {
        throw new Error("资源地址返回了网页，请检查 ZIP 的位置和名称");
    }

    const total = Number(response.headers.get("content-length"));
    let zipBytes: Uint8Array;

    if (
        !response.body ||
        !Number.isSafeInteger(total) ||
        total <= 0 ||
        response.headers.get("content-encoding")
    ) {
        zipBytes = new Uint8Array(await response.arrayBuffer());
    } else {
        const reader = response.body.getReader();
        zipBytes = new Uint8Array(total);

        let received = 0;
        let lastUpdate = 0;
        onProgress(`${readLabel}：0%`, 0);

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break
                }

                if (received + value.length > total) {
                    throw new Error("下载内容超过服务器声明的大小");
                }

                zipBytes.set(value, received);
                received += value.length;

                // 最多约每 100 毫秒更新一次，避免频繁刷新 React
                const now = performance.now();
                if (now - lastUpdate >= 100) {
                    const percent = Math.floor(received / total * 100);
                    const receivedMiB = (received / 1024 / 1024).toFixed(1);
                    const totalMiB = (total / 1024 / 1024).toFixed(1);

                    onProgress( `${readLabel} ${receivedMiB}/${totalMiB} MiB（${percent}%）`,percent);
                    lastUpdate = now;
                }
            }
        } finally {
            reader.releaseLock();
        }

        if (received !== total) {
            throw new Error("下载内容不完整，请重试");
        }

        onProgress(`${readLabel}：100%`, 100);
    }


    // 只有这次从网络下载，才需要写入缓存
    if (!cachedResponse && packageCache) {
        onProgress("正在保存资源缓存，首次加载请稍候……");

        try {
            const cachedPackage = new Response(
                zipBytes.buffer as ArrayBuffer,
                {
                    headers: {
                        "Content-Type": "application/zip",
                        "Content-Length": String(zipBytes.byteLength)
                    }
                }
            );

            // 必须等待写入完成，再把 zip 缓冲区转移给解压 Worker
            await packageCache.put(url, cachedPackage);

            console.log("资源包已缓存：", url);
        } catch (error) {
            console.warn("资源缓存保存失败，本次继续启动：", error);
        }
    }

    onProgress("正在解压资源……");

    // Web Worker 是独立于页面主线程的 js 执行环境。zip 解压消耗 CPU
    const worker = new Worker(
        new URL("./unzip.worker.ts", import.meta.url),
        { type: "module" }
    );

    const files = await new Promise<Unzipped>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<UnzipReply>) => {
            const result = event.data;

            if (result.type === "error") {
                reject(new Error(result.message));
                return;
            }

            if (result.type === "progress") {
                onProgress(`正在解压资源：${result.percent}%`, result.percent);
                return;
            }

            resolve(result.files);
        };

        worker.onerror = (event) => {
            reject(new Error(event.message || "后台解压失败"));
        };

        worker.onmessageerror = () => {
            reject(new Error("无法读取后台解压结果"));
        };

        worker.postMessage(
            { bytes: zipBytes, prefix: mod?.prefix },
            [zipBytes.buffer as ArrayBuffer]
        );
    }).finally(() => {
        // 成功或失败都关闭本次解压 Worker，避免后台实例继续占用资源。
        worker.terminate();
    });
    onProgress("解压完成，正在写入引擎……");

    const gameRoot = "/home/web_user/.local/share/vcmi";
    const root = mod ? `${gameRoot}/Mods/${mod.id}` : gameRoot;

    if (mod && !files[`${mod.prefix}mod.json`]) {
        throw new Error("模组包中没有找到预期的 mod.json，请检查目录结构");
    }

    let count = 0;
    let totalBytes = 0;

    for (const name of Object.keys(files)) {
        const bytes = files[name];
        const path = `${root}/${getRelativePath(name)}`;

        engine.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
        engine.FS.writeFile(path, bytes);

        count++;
        totalBytes += bytes.length;

        delete files[name];
    }

    if (count === 0) {
        throw new Error("资源包中没有找到可导入的文件");
    }

    return { count, totalBytes };
}
