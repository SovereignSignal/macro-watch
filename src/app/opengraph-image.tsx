import { ImageResponse } from 'next/og';
import {
  NEWSREADER_700_B64,
  NEWSREADER_400_B64,
  INSTRUMENT_SANS_600_B64,
  SCORPION_PNG_B64,
} from '@/lib/og-card-assets';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt =
  'Sovs Macro: daily macro brief and research. A Sovereign Signal project.';

const SCORPION_DATA_URI = `data:image/png;base64,${SCORPION_PNG_B64}`;

// Scorpion aspect ratio is 152:182 (width:height)
const LARGE_SCORPION_HEIGHT = 76;
const LARGE_SCORPION_WIDTH = (152 / 182) * LARGE_SCORPION_HEIGHT;

const SMALL_SCORPION_HEIGHT = 30;
const SMALL_SCORPION_WIDTH = (152 / 182) * SMALL_SCORPION_HEIGHT;

export function cardElement() {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        backgroundColor: '#F3EFE6',
        position: 'relative',
        display: 'flex',
      }}
    >
      {/* Row 1: Large scorpion and title */}
      <div
        style={{
          position: 'absolute',
          left: 88,
          top: 174,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <img
          src={SCORPION_DATA_URI}
          width={LARGE_SCORPION_WIDTH}
          height={LARGE_SCORPION_HEIGHT}
          alt=""
        />
        <div
          style={{
            marginLeft: 44,
            fontFamily: 'Newsreader',
            fontWeight: 700,
            fontSize: 107,
            color: '#17171A',
            letterSpacing: '-0.01em',
            lineHeight: 1,
          }}
        >
          Sovs Macro
        </div>
      </div>

      {/* Double rule */}
      <div
        style={{
          position: 'absolute',
          left: 88,
          right: 88,
          top: 318,
          height: 4,
          backgroundColor: '#17171A',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 88,
          right: 88,
          top: 326,
          height: 2,
          backgroundColor: '#17171A',
        }}
      />

      {/* Subtitle */}
      <div
        style={{
          position: 'absolute',
          left: 88,
          top: 362,
          fontFamily: 'Newsreader',
          fontWeight: 400,
          fontSize: 47,
          color: '#3F3E3A',
        }}
      >
        Daily macro brief and research
      </div>

      {/* Faint rule */}
      <div
        style={{
          position: 'absolute',
          left: 88,
          right: 88,
          top: 521,
          height: 1,
          backgroundColor: '#CFC8B8',
        }}
      />

      {/* Footer row */}
      <div
        style={{
          position: 'absolute',
          left: 88,
          top: 544,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <img
          src={SCORPION_DATA_URI}
          width={SMALL_SCORPION_WIDTH}
          height={SMALL_SCORPION_HEIGHT}
          alt=""
        />
        <div
          style={{
            marginLeft: 14,
            fontFamily: 'Instrument Sans',
            fontWeight: 600,
            fontSize: 22,
            color: '#26262A',
            letterSpacing: '0.11em',
          }}
        >
          A SOVEREIGN SIGNAL PROJECT
        </div>
      </div>
    </div>
  );
}

export default async function Image() {
  return new ImageResponse(cardElement(), {
    ...size,
    fonts: [
      {
        name: 'Newsreader',
        data: Buffer.from(NEWSREADER_700_B64, 'base64'),
        weight: 700,
        style: 'normal',
      },
      {
        name: 'Newsreader',
        data: Buffer.from(NEWSREADER_400_B64, 'base64'),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Instrument Sans',
        data: Buffer.from(INSTRUMENT_SANS_600_B64, 'base64'),
        weight: 600,
        style: 'normal',
      },
    ],
  });
}
