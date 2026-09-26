import type { PointerEvent } from "react";

interface GameCardProps {
    title: string;
    subtitle: string;
    background: string;
    themeColor: string;
    character: string;
    characterClassName?: string;
    onStart: () => void;
}

export default function GameCard({
    title,
    subtitle,
    background,
    themeColor,
    character,
    characterClassName = "card_character",
    onStart,
}: GameCardProps) {
    function handleCardMove (event: PointerEvent<HTMLButtonElement>) {
        if (event.pointerType !== "mouse") {
            return
        }

        const card = event.currentTarget;
        const rect = card.getBoundingClientRect();

        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;

        // 将计算结果交给 CSS，最大倾斜约 10 度
        card.style.setProperty("--rotate-x", `${-y * 10}deg`);
        card.style.setProperty("--rotate-y", `${x * 10}deg`);
    }

    function handleCardReset(event: PointerEvent<HTMLButtonElement>) {
        // 移出卡片后恢复正面
        event.currentTarget.style.removeProperty("--rotate-x");
        event.currentTarget.style.removeProperty("--rotate-y");
    }

    return (
        <button 
            type="button"
            className="card group" 
            onPointerMove={handleCardMove}
            onPointerLeave={handleCardReset}
            onPointerCancel={handleCardReset}
            onClick={onStart}
        >
            <span>
                <img className="card_background" src={background}></img>
                <img className={characterClassName} src={character}></img>
            </span>
            <div className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-b-xl pointer-events-none">
                <div className="absolute inset-0 opacity-100 transition-opacity duration-300 ease-out group-hover:opacity-0"
                    style={{
                        backgroundImage: `linear-gradient(0deg, ${themeColor}d8 20%, transparent 80%, transparent 100%)`,
                    }}
                />
                <div className="relative flex flex-col items-center mt-auto pb-8 text-center
                        opacity-100 translate-y-0 transition duration-300 ease-out
                        group-hover:translate-y-8 group-hover:opacity-0"
                >
                    <h1 className="text-[2rem] font-bold leading-9">{title}</h1>
                    <span className="tracking-widest">{subtitle}</span>
                </div>
            </div>
        </button>
    );
}