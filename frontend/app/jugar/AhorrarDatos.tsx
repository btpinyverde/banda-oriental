import { useId } from "react";
import "./ahorrar-datos.css";

/** Para quien juega con datos móviles o una conexión lenta: las pistas suenan igual, pero pesan la mitad. */
export function AhorrarDatos({ activo, alCambiar }: { activo: boolean; alCambiar: (valor: boolean) => void }) {
  const explicacion = useId();
  return (
    <div className="ahorrar-datos">
      <label>
        <input type="checkbox" checked={activo} aria-describedby={explicacion} onChange={(evento) => alCambiar(evento.target.checked)} />
        <span>Ahorrar datos</span>
      </label>
      <small id={explicacion}>Usa audio más liviano (pesa la mitad).</small>
    </div>
  );
}
