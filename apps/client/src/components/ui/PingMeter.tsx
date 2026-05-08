import styles from './PingMeter.module.css';

export interface PingMeterProps {
  /** Round-trip time in milliseconds. */
  rtt: number;
}

export default function PingMeter({ rtt }: PingMeterProps) {
  const lvl = rtt < 50 ? 4 : rtt < 150 ? 3 : rtt < 300 ? 2 : 1;
  return (
    <div className={styles.ping} aria-label={`Ping ${rtt} ms`}>
      <div className={styles.bars} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} data-on={i <= lvl ? 'true' : 'false'} />
        ))}
      </div>
      <span>{rtt} ms</span>
    </div>
  );
}
