import Image from 'next/image';
import { cn } from '@/lib/utils';

interface NisLogoProps {
  className?: string;
}

const GoogleLogo = ({ className }: { className?: string }) => (
  <svg
    className={cn('h-5 w-5', className)}
    viewBox="0 0 48 48"
  >
    <path
      fill="#FFC107"
      d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8
         c-6.627,0-12-5.373-12-12 c0-6.627,5.373-12,12-12
         c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657
         C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24
         c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20
         C44,22.659,43.862,21.35,43.611,20.083z"
    />
    <path
      fill="#FF3D00"
      d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12
         c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657
         C34.046,6.053,29.268,4,24,4
         C16.318,4,9.656,8.337,6.306,14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238
         C29.211,35.091,26.715,36,24,36
         c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025
         C9.505,39.556,16.227,44,24,44z"
    />
    <path
      fill="#1976D2"
      d="M43.611,20.083H42V20H24v8h11.303
         c-0.792,2.237-2.231,4.166-4.087,5.574
         c0,0,0.001-0.001,0.002-0.001l6.19,5.238
         C36.971,39.205,44,34,44,24
         C44,22.659,43.862,21.35,43.611,20.083z"
    />
  </svg>
);

export const Icons = {
  Logo: GoogleLogo,
  NisLogo: ({ className }: NisLogoProps) => {
    return (
      <div className={cn('relative h-8 w-8', className)}>
        <Image
          src="/nis_logo.png"
          alt="NIS HR System Logo"
          fill
          style={{ objectFit: 'contain' }}
          priority
        />
      </div>
    );
  },
  StudioLogo: ({ className }: { className?: string }) => (
    <svg
      className={cn("h-8 w-8", className)}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_139_2)">
        <path
          d="M51.1093 219.742L35.918 202.923L153.219 40.233L167.318 43.109L51.1093 219.742Z"
          fill="#FCCA3F"
        />
        <path
          d="M125.688 123.513L51.1211 219.742L72.2461 243.609L167.318 43.109L125.688 123.513Z"
          fill="#F57C00"
        />
        <path
          d="M153.22 40.232L35.9175 202.922L54.8965 224.28L205.811 75.99L153.22 40.232Z"
          fill="#FFA000"
        />
        <path
          d="M205.811 75.99L167.318 43.109L72.2461 243.609L90.9326 255.432L205.811 75.99Z"
          fill="#F4511E"
        />
      </g>
      <defs>
        <clipPath id="clip0_139_2">
          <rect width="256" height="256" fill="white" />
        </clipPath>
      </defs>
    </svg>
  ),
};
