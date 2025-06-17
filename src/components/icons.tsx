import Image from 'next/image';
import { cn } from '@/lib/utils';

interface NisLogoProps {
  className?: string;
}

export const Icons = {
  Logo: ({ className }: NisLogoProps) => {
    return (
      <div className={cn("relative", className)}>
        <Image
          src="/nis_logo.png" // This will resolve to public/nis_logo.png
          alt="NIS HR System Logo"
          layout="fill"
          objectFit="contain" // This will maintain aspect ratio and fit within the div
          priority // Consider loading the logo with priority
        />
      </div>
    );
  },
};
