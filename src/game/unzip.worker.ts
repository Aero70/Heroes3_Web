/// <reference lib="webworker" />

import { unzipSync, Unzip, UnzipInflate } from "fflate";
import type { Unzipped } from "fflate";

declare const self: DedicatedWorkerGlobalScope;

type UnzipRequest = {
    bytes: Uint8Array;
    prefix?: string;
};

export type UnzipReply =
    | { type: "progress"; percent: number }
    | { type: "done"; files: Unzipped }
    | { type: "error"; message: string };


self.onmessage = (event: MessageEvent<UnzipRequest>) => {
    const { bytes, prefix } = event.data;

    //  zip 条目导入控制
    function shouldExtract(name: string) {
        const relativePath = prefix === undefined ? 
            name : name.startsWith(prefix) ? name.slice(prefix.length) : "";

        const parts = relativePath.split("/");

        // 路径检查判断
        if (
            !relativePath ||
            relativePath.includes("\\") ||
            parts.some(part => !part || part === "." || part === "..")
        ) {
            return false;
        }

        if (prefix !== undefined) {
            return true
        }

        // 基础包只保留 Data、Maps、mp3 三类根目录 vcmi 引擎即可构建游戏
        return ["data", "maps", "mp3"].includes(
            parts[0].toLowerCase()
        );
    }

    try {
        self.postMessage({ type: "progress", percent: 0 });

        const sizes = new Map<string, number>();
        let total = 0;

        unzipSync(bytes, {
            filter: (file) => {
                if (shouldExtract(file.name)) {
                    sizes.set(file.name, file.originalSize);
                    total += file.originalSize;
                }
                return false;
            }
        });

        if (sizes.size === 0) {
            throw new Error("资源包中没有找到可导入的文件");
        }

        const files: Unzipped = Object.create(null);

        // 统计
        let completed = 0;
        let pending = 0;

        const stream = new Unzip((file) => {
            const size = sizes.get(file.name);

            if (size === undefined) {
                return
            }

            const output = new Uint8Array(size);
            let offset = 0;
            pending++;

            file.ondata = (error, chunk, final) => {
                if (error) {
                    throw error
                }

                // offset 是当前文件内部的偏移
                // completed 是整个解压任务的累计量。
                output.set(chunk, offset);
                offset += chunk.length;
                completed += chunk.length;

                if (final) {
                    if (offset !== size) {
                        throw new Error(`文件解压不完整：${file.name}`);
                    }

                    files[file.name] = output;
                    pending--;
                }
            };

            file.start();
        });

        stream.register(UnzipInflate);

        const chunkSize = 256 * 1024;
        let lastUpdate = 0;

        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            const end = Math.min(offset + chunkSize, bytes.length);

            stream.push(bytes.subarray(offset, end), end === bytes.length);

            const now = performance.now();

            if (now - lastUpdate >= 100 && total > 0) {
                const percent = Math.min(99, Math.floor(completed / total * 100));
                self.postMessage({ type: "progress", percent });
                lastUpdate = now;
            }
        }

        // 所有文件结束、输出字节数吻合、输出文件数量吻合
        if (
            pending !== 0 ||
            completed !== total ||
            Object.keys(files).length !== sizes.size
        ) {
            throw new Error("资源解压未完整结束");
        }

        self.postMessage({ type: "progress", percent: 100 });

        const buffers = Object.values(files).map(
            file => file.buffer as ArrayBuffer
        );

        self.postMessage({ type: "done", files }, [...new Set(buffers)]);
        
    } catch (error) {
        self.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : String(error)
        });
    }
};
