import React, { forwardRef } from "react"

const Slider = forwardRef(({ className, defaultValue, value, onValueChange, max, maxValue, step, ...props }, ref) => {
  const maximum = maxValue !== undefined ? maxValue : (max !== undefined ? max : 100)
  const actualValue = value !== undefined ? value[0] : (defaultValue !== undefined ? defaultValue[0] : 0)
  
  const percentage = maximum > 0 ? (actualValue / maximum) * 100 : 0

  const handleChange = (e) => {
    if (onValueChange) {
      onValueChange([parseFloat(e.target.value)])
    }
  }

  return (
    <div className={`relative flex w-full touch-none select-none items-center group ${className || ''}`}>
      <input
        type="range"
        ref={ref}
        min={0}
        max={maximum}
        step={step || 1}
        value={actualValue}
        onChange={handleChange}
        onPointerDown={props.onPointerDown}
        onPointerUp={props.onPointerUp}
        className="w-full h-1.5 appearance-none cursor-pointer rounded-full outline-none"
        style={{
          background: `linear-gradient(to right, #2563eb ${percentage}%, #e5e7eb ${percentage}%)`
        }}
        {...props}
      />
      <style>{`
        /* Custom styles for range slider thumb */
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          box-shadow: 0 0 0 2px white, 0 1px 3px rgba(0,0,0,0.3);
          transition: transform 0.1s;
        }
        input[type=range]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 0 2px white, 0 1px 3px rgba(0,0,0,0.3);
          transition: transform 0.1s;
        }
        input[type=range]:active::-webkit-slider-thumb {
          transform: scale(1.2);
        }
        input[type=range]:active::-moz-range-thumb {
          transform: scale(1.2);
        }
        input[type=range]:hover::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px white, 0 1px 4px rgba(0,0,0,0.4);
        }
      `}</style>
    </div>
  )
})

Slider.displayName = "Slider"
export { Slider }
