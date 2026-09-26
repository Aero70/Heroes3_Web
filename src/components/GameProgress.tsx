import type { CSSProperties } from "react";
import "./index.css"

interface GameProgressProps {
    active: boolean;   // 是否正在加载
    percent?: number;  // undefined 表示暂时无法计算百分比
}

// 浮尘
const particles = Array.from({ length: 17 }, (_, index) => ({
    id: index,
    top: 15 + (index * 23) % 70,
    start: 1 + (index * 17) % 100,
    duration: 1.2 + (index % 4) * 0.15,
    delay: -index * 0.65,
}));

export default function GameProgress({
    active,
    percent,
}: GameProgressProps) {
    const value = typeof percent === "number" && Number.isFinite(percent)
            ? Math.min(100, Math.max(0, percent)) : undefined;
    const label = value === undefined ? "正在等待..." : `${Math.round(value)}%`;

    return (
        <div className="game-progress" data-active={active}>

            <progress className="sr-only" max={100} value={active ? value : 0} />
            <div className="game-progress_track">
                <div className="game-progress_fill"
                    style={{
                        width: `${active ? (value ?? 0) : 0}%`,
                    }}
                >
                    <div className="game-progress_particles">
                        {particles.map((particle) => (
                            <div key={particle.id}
                                className="game-progress_particle-lane"
                                style={{
                                    top: `${particle.top}%`,
                                    "--start": `${particle.start}%`,
                                    "--duration": `${particle.duration}s`,
                                    animationDelay: `${particle.delay}s`,
                                } as CSSProperties}
                            >
                                <span className="game-progress_spark" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            {/* 根据生成的浮尘数组生成dom 静止 */}
            {
                !active && <div className="game-progress_particles">
                    {particles.map((particle) => (
                        <div key={particle.id}
                            className="game-progress_particle-lane"
                            style={{
                                top: `${particle.top}%`,
                                "--start": `${particle.start}%`,
                                "--duration": `${particle.duration}s`,
                                animationDelay: `${particle.delay}s`,
                            } as CSSProperties}
                        >
                            <span className="game-progress_spark" />
                        </div>
                    ))}
                </div>
            }

            <span className="game-progress_label">
                {label}
            </span>
        </div>
    );
}