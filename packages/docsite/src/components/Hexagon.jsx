export default function Hexagon({ scale = 1, animationDelay = 0, duration = null, color = 'red', ...rest }) {
    return (
        <div {...rest} style={{ animationDelay: `${animationDelay}ms`, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%'  }}>
            <div
                style={{ backgroundColor: color, transform: `scale(${scale}) rotate(90deg)` }}
                className="hex"
            ></div>
        </div>
    )
}