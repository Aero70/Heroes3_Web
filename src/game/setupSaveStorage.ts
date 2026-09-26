import type { VcmiEngine } from "./loadEngine";

export const saveDirectories: Record<string, string> = {
    "Heroes3HDV4.0": "vcmi-demo-saves",
    "Heroes3HDV4.0_HotA1.80": "vcmi-hota-saves",
    "Heroes3HDV4.0_era3": "vcmi-wog-saves"
};

export async function setupSaveStorage(
    engine: VcmiEngine,
    directoryName: string,
    onStatus: (message: string) => void
) {
    const saveRoot = "/home/web_user/.local/share/vcmi/Saves/";

    // 路径格式判断
    function isSavePath(path: string) {
        return path.toLowerCase().endsWith(".vsgm1")
        && !path.includes("\\")
        && !path.split("/").some(part => !part || part === "..");
    }

    onStatus("正在恢复浏览器存档……");

    const browserRoot = await navigator.storage.getDirectory();
    const directory = await browserRoot.getDirectoryHandle(directoryName, { create: true } );

    engine.FS.mkdirTree(saveRoot);

    let restoredCount = 0;

    for await (const [name, handle] of directory.entries()) {
        if (handle.kind !== "file") {
            continue
        };

        const relativePath = decodeURIComponent(name);
        if (!isSavePath(relativePath)) {
            continue
        };

        const file = await handle.getFile();
        const path = saveRoot + relativePath;

        engine.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
        engine.FS.writeFile(
        path,
        new Uint8Array(await file.arrayBuffer())
        );

        restoredCount++;
    }

    onStatus(`找到 ${restoredCount} 个浏览器存档。`);

    let saveQueue = Promise.resolve();
    let saveFailed = false;

    function reportError(error: unknown) {
        saveFailed = true;
        console.error(error);
        const message =
        error instanceof Error ? error.message : String(error);
        onStatus(`存档写入失败：${message}`);
    }

    engine.fsUpdate = (filePointer, bufferPointer, length) => {
        try {
            const path = engine.UTF8ToString(filePointer);
            if (!path.startsWith(saveRoot)) {
                return
            }
            const relativePath = path.slice(saveRoot.length);
            if (!isSavePath(relativePath)) {
                return
            }

            const bytes = new Uint8Array(
                engine.HEAPU8.subarray(bufferPointer, bufferPointer + length)
            );

            onStatus("存档等待写入，请暂勿刷新……");

            saveQueue = saveQueue.then(async () => {
                onStatus(`正在保存：${relativePath}`);

                const handle = await directory.getFileHandle(
                    encodeURIComponent(relativePath),
                    { create: true }
                );

                // write 写入内容
                // close 完成这次写入
                const writer = await handle.createWritable();
                await writer.write(bytes);
                await writer.close();

                onStatus(`已保存：${relativePath}`);

            }).catch(reportError);
        } catch (error) {
            reportError(error);

        } finally {
            engine._free(filePointer);
            engine._free(bufferPointer);
        }
    }

    return {
        async waitForPendingSaves() {
            await saveQueue;
            if (saveFailed) {
                throw new Error("本次运行有存档写入失败，已取消自动刷新。");
            }
        }
    }
}
