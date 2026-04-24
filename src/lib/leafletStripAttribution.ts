/**
 * Убирает блок атрибуции в углу Leaflet (как в clinic-ecosystem MapComponent.removeAttribution).
 * Всегда передавайте `map.getContainer()`, чтобы не затронуть другие карты на странице.
 */
export function stripLeafletAttributionFromContainer(container: HTMLElement | null) {
  if (!container) return;

  const run = () => {
    const attributionElements = container.querySelectorAll(
      ".leaflet-control-attribution, .leaflet-bottom.leaflet-right",
    );
    attributionElements.forEach((el) => {
      (el as HTMLElement).style.display = "none";
      el.remove();
    });
    container.querySelectorAll("a[href*='openstreetmap'], a[href*='leafletjs']").forEach((el) => {
      if (el.closest(".leaflet-popup")) return;
      (el as HTMLElement).style.display = "none";
      el.remove();
    });
    const bottomRight = container.querySelector(".leaflet-bottom.leaflet-right");
    if (bottomRight) (bottomRight as HTMLElement).style.display = "none";
  };

  setTimeout(run, 100);
  setTimeout(run, 350);
}
