const appleDisplays = [
  [375, 667, 2],
  [375, 812, 3],
  [390, 844, 3],
  [393, 852, 3],
  [402, 874, 3],
  [414, 736, 3],
  [414, 896, 2],
  [414, 896, 3],
  [420, 912, 3],
  [428, 926, 3],
  [430, 932, 3],
  [440, 956, 3],
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [834, 1112, 2],
  [834, 1194, 2],
  [834, 1210, 2],
  [744, 1133, 2],
  [1024, 1366, 2],
  [1032, 1376, 2],
] as const;

export const appleStartupImages = appleDisplays.flatMap(([width, height, scale]) =>
  (['portrait', 'landscape'] as const).map((orientation) => {
    const [imageWidth, imageHeight] = orientation === 'portrait' ? [width, height] : [height, width];

    return {
      url: `/pwa-startup/${imageWidth * scale}x${imageHeight * scale}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: ${orientation})`,
    };
  }),
);
