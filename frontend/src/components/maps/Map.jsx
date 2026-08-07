import { Capacitor } from "@capacitor/core";
import WebMap from "./WebMap";
import AndroidMap from "./AndroidMap";

export default function Map(props) {
  if (Capacitor.isNativePlatform()) {
    return <AndroidMap {...props} />;
  }

  return <WebMap {...props} />;
}