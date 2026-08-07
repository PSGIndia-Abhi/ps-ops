// import {
//   Map as GoogleMap,
//   AdvancedMarker,
//   Pin,
// } from "@vis.gl/react-google-maps";

// import logo from "../../assets/logo.png";

// export default function WebMap({
//   center,
//   zoom = 15,
//   markers = [],
// }) {
//   return (
//     <GoogleMap
//       mapId={import.meta.env.VITE_GOOGLE_MAP_ID}
//       style={{
//         width: "100%",
//         height: "400px",
//         borderRadius: "12px",
//       }}
//       defaultCenter={center}
//       defaultZoom={zoom}
//       gestureHandling="greedy"
//       disableDefaultUI={true}
//       zoomControl={true}
//     >
//       {markers.map((marker) => (
//         <AdvancedMarker
//           key={marker.id}
//           position={{
//             lat: Number(marker.lat),
//             lng: Number(marker.lng),
//           }}
//           title={marker.title}
//         >
//           {marker.type === "technician" ? (
//             <div className="technician-map-marker">
//               <img
//                 src={logo}
//                 alt=""
//                 className="technician-marker-logo"
//               />

//               <span className="technician-marker-initials">
//                 {marker.initials || "T"}
//               </span>
//             </div>
//           ) : (
//             <Pin />
//           )}
//         </AdvancedMarker>
//       ))}
//     </GoogleMap>
//   );
// }
import { useEffect } from "react";
import {
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";

import logo from "../../assets/logo.png";

function Polyline({ path }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !path || path.length < 2) return;

    const line = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#2563EB",
      strokeOpacity: 1,
      strokeWeight: 5,
    });

    line.setMap(map);

    // Fit map to route
    const bounds = new google.maps.LatLngBounds();

    path.forEach((p) => bounds.extend(p));

    map.fitBounds(bounds, 60);

    return () => {
      line.setMap(null);
    };
  }, [map, path]);

  return null;
}

function VisitMarker({ marker }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: "translateY(-10px)",
      }}
    >
      <div
        style={{
          background: "#111827",
          color: "#ffffff",
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1.1,
          padding: "4px 8px",
          borderRadius: 999,
          boxShadow: "0 8px 18px rgba(15, 23, 42, 0.18)",
          whiteSpace: "nowrap",
          marginBottom: 6,
        }}
      >
        {marker.timeLabel || marker.title}
      </div>

      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "#2563eb",
          color: "#ffffff",
          border: "3px solid #ffffff",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          fontWeight: 800,
          boxShadow: "0 10px 20px rgba(37, 99, 235, 0.35)",
        }}
      >
        {marker.label || "V"}
      </div>
    </div>
  );
}

export default function WebMap({
  center,
  zoom = 15,
  markers = [],
  polyline = [],
}) {
  return (
    <GoogleMap
      mapId={import.meta.env.VITE_GOOGLE_MAP_ID}
      style={{
        width: "100%",
        height: "500px",
        borderRadius: "12px",
      }}
      defaultCenter={center}
      defaultZoom={zoom}
      gestureHandling="greedy"
      disableDefaultUI={true}
      zoomControl={true}
    >
      <Polyline path={polyline} />

      {markers.map((marker) => (
        <AdvancedMarker
          key={marker.id}
          position={{
            lat: Number(marker.lat),
            lng: Number(marker.lng),
          }}
          title={marker.title}
        >
          {marker.type === "technician" ? (
            <div className="technician-map-marker">
              <img
                src={logo}
                alt=""
                className="technician-marker-logo"
              />

              <span className="technician-marker-initials">
                {marker.initials || "T"}
              </span>
            </div>
          ) : marker.type === "visit" ? (
            <VisitMarker marker={marker} />
          ) : (
            <Pin />
          )}
        </AdvancedMarker>
      ))}
    </GoogleMap>
  );
}
