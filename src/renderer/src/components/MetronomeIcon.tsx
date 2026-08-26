import React from 'react'

export interface MetronomeIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  color?: string
  strokeWidth?: number | string
}

export const MetronomeIcon: React.FC<MetronomeIconProps> = ({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="m12 18 3.5-12" />
    <circle cx="15.5" cy="6" r="1.5" fill={color} />
    <path d="M5 22h14" />
    <path d="M7.5 22 10.5 4h3l3 18" />
  </svg>
)
