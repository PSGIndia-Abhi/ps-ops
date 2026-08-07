import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import router from "./router";
import "./index.css";
import "./styles/admin.css";
import "./styles/job.css";
import { APIProvider } from "@vis.gl/react-google-maps";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

window._0xA13H1 = () => {
  console.log("RW5naW5lZXJlZCBieSBBYmhpLiBRdWlldGx5IHJlbGlhYmxlLgpTaW1wbGljaXR5IGlzIHRoZSB1bHRpbWF0ZSBzb3BoaXN0aWNhdGlvbi4gCkxlb25hcmRvIGRhIFZpbmNp Groups of four might help");
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} 
    libraries={["geometry"]}
    >
      <RouterProvider router={router} />
    </APIProvider>
  </React.StrictMode>
);
