import type { ReactNode } from "react";
import "./index.css"

export default function InforBox ({ children }:{
    children : ReactNode
}) {

    return (
        <div className="info-Box">
            <div className="info-Box_frame">
                <div className="info-Box_top-left" />
                <div className="info-Box_top" />
                <div className="info-Box_top-right" />

                <div className="info-Box_left" />
                <div className="info-Box_right" />

                <div className="info-Box_bottom-left" />
                <div className="info-Box_bottom" />
                <div className="info-Box_bottom-right" />
            </div>

            <div className="info-Box_content">
                {children}
            </div>
        </div>
    )
}