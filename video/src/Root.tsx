import { Composition } from "remotion";
import { StockShowcase } from "./Showcase";

export const RemotionRoot = () => {
  return (
    <Composition
      id="StockIaShowcase"
      component={StockShowcase}
      durationInFrames={1620}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
