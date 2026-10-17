import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./state/theme";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
