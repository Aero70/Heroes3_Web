//  Emscripten 生成的 js 的部分 api
export interface VcmiEngine {
    // 这里的 FS 是 Emscripten 的 File System 文件系统。这里操作的是引擎看到的虚拟文件
    FS: {
        readdir(path: string): string[];
        mkdirTree(path: string): void;
        writeFile(path: string, data: Uint8Array | string): void;
    };

    callMain(args: string[]): unknown;
    HEAPU8: Uint8Array; //读取引擎内存中的存档内容。
    UTF8ToString(pointer: number): string; //读取引擎传来的文件路径。

    /**
     * 项目约定的回调：引擎通知网页'有文件更新'
     * 三个 number 分别是文件路径的内存地址、文件内容的内存地址、字节数
     * 地址本身不是字符串或文件内容，所以必须用 UTF8ToString / HEAPU8 去读取
     */
    fsUpdate: (
        filePointer: number,
        bufferPointer: number,
        length: number
    ) => void;
    getWidth: () => number;
    getHeight: () => number;

    // VCMI 移植版提供的回调约定
    gameStarted: () => void;
    quitGame: () => void;

    _free(pointer: number): void;
    free(pointer: number): void;
}

export async function loadEngine(
    canvas: HTMLCanvasElement
): Promise<VcmiEngine>{

    // 当前 vcmi 是支持多线程的网页构建 同时使用了Web Worker和SharedArrayBuffer,
    // 而浏览器对共享内存等能力设置了更严格的安全条件，所以在vite.config里开启了跨源隔离并且在这里判断一下是否支持
    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined" ) {
        throw new Error(
            "当前环境未提供游戏所需的跨源隔离或共享内存能力。" +
            "移动端请使用已验证可运行的 Edge 浏览器打开。"
        );
    }

    const resourceUrl = new URL(`${import.meta.env.BASE_URL}vcmi/`,window.location.href);

    // 把引擎的普通输出和错误输出接到浏览器控制台方便定位和观察
    const options = {
        canvas,
        print: (text: string) => console.log(text),
        printErr: (text: string) => console.error(text),
        locateFile: (name: string) => new URL(name, resourceUrl).href
    };
    Object.assign(window, { Module: options });

    // 等数据加载脚本执行完，再创建引擎
    await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");

            script.src = new URL("vcmiclient.data.js", resourceUrl).href;
            script.onload = () => resolve();
            script.onerror = () => {
            script.remove();

            reject(new Error("无法加载 vcmiclient.data.js"));
        };
        // 将节点插入文档后，浏览器才会按 src 加载这个脚本
        document.head.appendChild(script);
    });

    const engineUrl = new URL("vcmiclient.js", resourceUrl).href;
    const { default: createEngine } = await import(
        /* @vite-ignore */ engineUrl
    );

    const engine: VcmiEngine = await createEngine(options);
    const configRoot = "/home/web_user/.config/vcmi";

    engine.FS.mkdirTree(configRoot);
    engine.FS.mkdirTree("/home/web_user/.cache/vcmi");
    engine.FS.writeFile(
        `${configRoot}/settings.json`,
        JSON.stringify({
            general: { language: "chinese" }
        })
    )
    
    // 默认模组配置，在选择版本时会覆写
    engine.FS.writeFile(
        `${configRoot}/modSettings.json`,
        JSON.stringify({
            activePreset: "default",
            presets: {
            default: {
                mods: ["vcmi", "chinese-translation"]
            }
            }
        })
    );

    // 引擎调用时读取画布的当前内部尺寸。
    engine.getWidth = () => canvas.width;
    engine.getHeight = () => canvas.height;
    engine.free = engine._free;
    
    return engine;
}

