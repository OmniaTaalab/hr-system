import type { LucideProps } from "lucide-react";

export const Icons = {
  Logo: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 40" // Adjusted viewBox for a more rectangular logo
      fill="currentColor" // Changed to fill for solid text
      stroke="none" // No stroke for text-based logo
      {...props}
    >
      <title>NIS HR System Logo</title>
      {/* Simple text "NIS" logo */}
      <text 
        x="50%" 
        y="50%" 
        dominantBaseline="middle" 
        textAnchor="middle" 
        fontSize="30" // Adjusted font size
        fontWeight="bold"
        fontFamily="sans-serif" // Generic sans-serif font
      >
        NIS
      </text>
    </svg>
  ),
};
