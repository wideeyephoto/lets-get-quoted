import Image from 'next/image';
import styles from './WebsiteFeaturePreview.module.css';

export default function WebsiteFeaturePreview() {
  return (
    <figure className={styles.previewStage}>
      <div className={styles.desktopFrame}>
        <Image
          src="/media/website-builder/lawn-and-order/lawn-and-order-desktop-hero.jpg"
          alt="Generated Lawn & Order contractor website showing service headline, instant-estimate action, and Google review trust badge."
          width={1424}
          height={890}
          sizes="(max-width: 900px) 100vw, 50vw"
          className={styles.desktopImg}
          loading="lazy"
        />
      </div>
      <div className={styles.mobileFrame}>
        <Image
          src="/media/website-builder/lawn-and-order/lawn-and-order-mobile-hero.jpg"
          alt=""
          width={464}
          height={968}
          sizes="(max-width: 560px) 28vw, 160px"
          className={styles.mobileImg}
          loading="lazy"
        />
      </div>
      <figcaption className="sr-only">
        The same generated contractor website shown on desktop and mobile.
      </figcaption>
    </figure>
  );
}
