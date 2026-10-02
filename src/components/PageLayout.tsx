import { useRef, useState } from "react";
import { loadEngine } from "../game/loadEngine";
import { loadGameResources,Source } from "../game/loadGameResources";
import type { VcmiEngine } from "../game/loadEngine";
import { saveDirectories,setupSaveStorage } from "../game/setupSaveStorage";

import GameCard from "./GameCard";
import InfoBox from "./InforBox";
import GameProgress from "./GameProgress";

import classicBackground from "../assets/cards/z1.png";
import classicCharacter from "../assets/cards/z1-1.png";
import hotaBackground from "../assets/cards/z2.png";
import hotaCharacter from "../assets/cards/z2-1.png";
import wogBackground from "../assets/cards/z3.png";
import wogCharacter from "../assets/cards/z3-1.png";

import cornerUL from "../assets/common/Agem0UL.png";
import cornerUR from "../assets/common/Agem0UR.png";
import cornerLL from "../assets/common/Agem0LL.png";
import cornerLR from "../assets/common/Agem0LR.png";

/**
 * 模组配置表
 */
const modPackages: Record<
    string,
    { manifestKey: "hota" | "wog"; id: string; prefix: string }
> = {
    "Heroes3HDV4.0_HotA1.80": {
        manifestKey: "hota",
        id: "hota",
        prefix: "horn-of-the-abyss-vcmi-1.7/"
    },
    "Heroes3HDV4.0_era3": {
        manifestKey: "wog",
        id: "wake-of-gods",
        prefix: "wake-of-gods-vcmi-1.7/"
    }
}

export default function PageLayout () {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const attemptedRef = useRef(false); // 引擎初始化状态
    const engineRef = useRef<VcmiEngine | null>(null); // 引擎对象

    const [isStartGame, setIsStartGame] = useState(false); // 是否启动游戏
    const [isLoad, setIsLoad] = useState(false); // 防止重复点击按钮
    const [loadPercent, setLoadPercent] = useState<number | undefined>(); // 进度值

    const [statusText, setStatusText] = useState("等待初始化引擎");
    const [TitleText, setTitleText] = useState<string | null>("等待选择");
    const [saveStatus, setSaveStatus] = useState("存档 : 等待读取");

    function handleResourceProgress(message: string, percent?: number) {
        setStatusText(message);
        setLoadPercent(percent);
    }

    //初始化 vcmi-wasm 运行环境
    async function handleInitialize() {
        const canvas = canvasRef.current;

        if (!canvas || attemptedRef.current) {
            return
        }

        attemptedRef.current = true;
        setStatusText("正在加载引擎和配置资源，请稍候……");
        setTitleText("正在构建");
        try {
            const engine = await loadEngine(canvas);
            // 初始化自检：能读取 /config 说明基础配置已进入虚拟文件系统。
            const entries = engine.FS.readdir("/config").filter(
                name => name !== "." && name !== ".."
            );
            setStatusText( `引擎初始化成功！配置目录包含 ${entries.length} 个条目。`);
            engineRef.current = engine; // 保存引用供 handleStart 使用

        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : String(error);
            setStatusText(`初始化失败：${message}。修复后请刷新页面重试。`);
        }
    }

    async function handleStart(version:string,gameName:string) {
        if(isLoad){
            return
        }
        await handleInitialize();
        setIsLoad(true);

        const engine = engineRef.current;
        const canvas = canvasRef.current;

        if (!engine || !canvas) {
            return
        }
        
        try {
            setTitleText(`正在准备: ${gameName}`);
            setStatusText("正在检查资源版本……");
            const manifestUrl = `${Source}/packages/manifest.json`;

            // 启动游戏时获取并检查资源清单，做版本控制 no-store：不做缓存每次访问都拿最新的
            const response = await fetch(manifestUrl, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(`资源清单读取失败：HTTP ${response.status}`);
            }

            const manifest: unknown = await response.json();
            if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
                throw new Error("资源清单格式不正确");
            }

            const entries = manifest as Record<string, unknown>;

            // 根据清单条目生成完整的 zip 下载地址
            function getPackageUrl(key: string) {
                const value = entries[key];

                if (typeof value !== "object" || value === null) {
                    throw new Error(`资源清单缺少条目：${key}`);
                }

                const entry = value as Record<string, unknown>;

                if (
                    typeof entry.revision !== "string" ||
                    !entry.revision.trim() ||
                    typeof entry.file !== "string" ||
                    !/^[a-zA-Z0-9_.-]+\.zip$/i.test(entry.file)
                ) {
                    throw new Error(`资源清单条目格式不正确：${key}`);
                }

                return new URL(entry.file, manifestUrl).href;
            }

            const packageUrl = getPackageUrl("base");
            const saveDirectory = saveDirectories[version];

            if (!saveDirectory) {
                throw new Error(`没有配置这个版本的存档目录：${version}`);
            }

            const resources = await loadGameResources(
                engine,
                packageUrl,
                handleResourceProgress
            );

            const mod = modPackages[version];
            if (mod) {
                setStatusText(`正在加载模组：${mod.id}`);
                await loadGameResources(
                    engine,
                    getPackageUrl(mod.manifestKey),
                    handleResourceProgress,
                    mod
                );
            }

            const enabledMods = ["vcmi", "chinese-translation"];
            if (mod) {
                enabledMods.push(mod.id);
            }

            engine.FS.writeFile(
                "/home/web_user/.config/vcmi/modSettings.json",
                JSON.stringify({
                    activePreset: "default",
                    presets: {
                        default: {
                            mods: enabledMods
                        }
                    }
                })
            )
            
            setStatusText(`已导入 ${resources.count} 个文件，正在启动游戏……`);

            engine.gameStarted = () => {
                setStatusText("游戏已启动。");
                setIsStartGame(true);
            }
            canvas.focus();
            
            const saveStorage = await setupSaveStorage(
                engine,
                saveDirectory,
                setSaveStatus
            );

            engine.quitGame = () => {
                // 如果用户保存了游戏就等保存完后刷新页面
                setStatusText("正在完成存档写入，随后返回版本选择……");
                void saveStorage.waitForPendingSaves()
                    .then(() => {
                        window.location.reload();
                    })
                    .catch((error: unknown) => {
                        console.error(error);
                        setStatusText("暂未返回版本选择，请检查存档保存失败的提示。");
                    });
                setIsLoad(false);
            }

            // 调用编译后程序的 main 入口
            // --nointro 跳过启动片头
            // callMain 返回也不能判断游戏已经退出，生命周期依靠上面的引擎回调
            engine.callMain(["--nointro"]);
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : String(error);
            setStatusText(`启动失败：${message}。请刷新页面后重试。`);
        }
    }

    async function handleLandscape() {
        try {
            // 全屏需要由用户点击触发。
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            }
        } catch (error) {
            console.warn("无法进入全屏：", error);
        }

        // 补充可选的 lock 类型；类型声明不会让浏览器凭空支持该功能。
        const orientation = screen.orientation as ScreenOrientation & {
            lock?: (direction: "landscape") => Promise<void>;
        };

        try {
            if (!orientation?.lock) {
                throw new Error("当前浏览器不支持方向锁定");
            }

            await orientation.lock("landscape");
        } catch (error) {
            console.warn("无法锁定横屏：", error);
            window.alert("请关闭手机的方向锁定，并手动横放手机进行游戏。");
        }

        canvasRef.current?.focus();
    }

    return (
        <>
        {/* 边框 */}
        { !isStartGame && <div className="pointer-events-none fixed inset-0 z-50 
            shadow-[inset_0_0_0_2px_#E4CB6C,inset_0_0_0_6px_#901516,inset_0_0_0_8px_#E4CB6C] 
            lg:shadow-[inset_0_0_0_2px_#E4CB6C,inset_0_0_0_8px_#901516,inset_0_0_0_11px_#E4CB6C]"
        >
            <img src={cornerUL} className="fixed top-[7px] left-[7px] lg:top-[10px] lg:left-[10px] z-50" />
            <img src={cornerUR} className="fixed top-[7px] right-[7px] lg:top-[10px] lg:right-[10px] z-50" />
            <img src={cornerLL} className="fixed bottom-[7px] left-[7px] lg:bottom-[10px] lg:left-[10px] z-50" />
            <img src={cornerLR} className="fixed bottom-[7px] right-[7px] lg:bottom-[10px] lg:right-[10px] z-50" />
        </div> }

        <section className="relative w-full min-h-screen lg:h-screen lg:overflow-hidden z-10">
            {!isStartGame && <div className="min-h-screen lg:h-full flex flex-col items-center lg:justify-center gap-6 lg:gap-12 z-10">
                <div className="h-fit py-5 flex flex-col lg:flex-row gap-4 lg:gap-16 items-center justify-center">
                    <GameCard
                        title="深渊号角"
                        subtitle="Horn of the Abyss"
                        background={hotaBackground}
                        themeColor="#2d4953"
                        character={hotaCharacter}
                        characterClassName="card_character_hota"
                        onStart={() => handleStart("Heroes3HDV4.0_HotA1.80","深渊号角")}
                    />

                    <GameCard
                        title="经典原版"
                        subtitle="v4.0 HD 完美版"
                        background={classicBackground}
                        themeColor="#716347"
                        character={classicCharacter}
                        onStart={() => handleStart("Heroes3HDV4.0","经典原版")}
                    />

                    <GameCard
                        title="追随神迹"
                        subtitle="In the Wake of Gods"
                        background={wogBackground}
                        themeColor="#2e2a51"
                        character={wogCharacter}
                        onStart={() => handleStart("Heroes3HDV4.0_era3","追随神迹")}
                    />
                </div>
                
                <div className="sticky bottom-2 z-40 w-full shrink-0 lg:static lg:w-auto">
                    <InfoBox>
                        <div className="tile flex flex-col w-full lg:w-4xl gap-2 lg:gap-6 lg:py-6 box-content">
                            <div className="w-full flex items-center justify-center text-[#fff6d6]">
                                <div className="relative flex lg:block flex-col items-center justify-center gap-2 lg:gap-0">
                                    <h2 className="text-[1.4rem] m-0">{TitleText}</h2>
                                    <span className="lg:absolute left-full top-1/2 -translate-y-1/2 lg:ml-3 whitespace-nowrap text-[.85rem] text-[#fff6d6]/70">
                                        {statusText}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="w-full px-6">
                                <GameProgress active={isLoad} percent={loadPercent} />
                            </div>
                            
                            <div className="w-full border-t border-amber-100/50 pt-2 lg:pt-6 flex flex-col lg:flex-row items-center text-[#fff6d6] text-[1rem] justify-center gap-1 lg:gap-6">
                                <span className="lg:ml-6">{saveStatus}</span>
                                <span className="lg:ml-auto lg:mr-6 text-[.7rem] lg:text-[.8rem] text-[#fff6d6]/70">首次加载需下载相关资源, 后续进入会优先读取缓存</span>
                            </div>
                        </div>
                    </InfoBox>
                </div>
            </div>}
            
            <canvas
                className={`
                    absolute top-0 left-1/2 -translate-x-1/2
                    block w-full h-auto max-h-screen lg:max-w-[1800px] z-5
                    ${isStartGame ? "visible" : "invisible pointer-events-none"}
                `}
                onContextMenu={event => event.preventDefault()}
                id="canvas"
                ref={canvasRef}
                width={1800}  
                height={1000}
                tabIndex={0}
            />

            {isStartGame && (
                <button type="button"
                    onClick={handleLandscape}
                    className="fixed right-4 top-4 z-[100] rounded bg-black/70 px-3 py-2 text-sm text-[#fff6d6]"
                >
                    全屏横屏
                </button>
            )}

            {!isStartGame && (
                <div>
                    <div className="loading-beam pointer-events-none absolute inset-0" />
                </div>
            )}
        </section>
        </>
    );
}
