import Image from "next/image";
import "./brand-lockup.css";

/** Original iChem and STC logos, side-by-side with a neutral separator. */
export default function BrandLockup({size="normal"}:{size?:"normal"|"large"|"compact"}){
  return <span className={"stc-brand-lockup stc-brand-lockup--"+size}
    dir="ltr" role="img" aria-label="iChem | STC">
    <Image src="/ichem-logo.png" alt="iChem — building solutions"
      width={480} height={198} className="stc-brand-lockup__ichem" unoptimized/>
    <span className="stc-brand-lockup__divider" aria-hidden="true"/>
    <Image src="/stc-logo.png" alt="STC"
      width={1378} height={519} className="stc-brand-lockup__stc" unoptimized/>
  </span>;
}
