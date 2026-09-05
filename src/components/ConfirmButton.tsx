import { useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Un botón que pregunta antes de romper algo.
 *
 * Existe porque el panel preguntaba de tres formas distintas y a veces de
 * ninguna: cerrar una cuenta o borrar una mesa abrían un diálogo de la app;
 * borrar una sección, el PDF de la carta o quitar a alguien del equipo usaban
 * el `confirm()` del navegador -- con el texto escrito a mano en español, así
 * que el selector de idioma no lo tocaba --; y borrar un plato, su foto o la
 * portada del restaurante no preguntaban nada.
 *
 * Aprender que una papelera de esta app a veces pregunta y a veces no obliga a
 * dudar delante de cada una. Ahora todas preguntan igual, dicen qué se pierde
 * y qué no, y el botón que confirma va en rojo y repite el verbo -- nunca un
 * "Aceptar" que no dice a qué.
 */
export function ConfirmButton({
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
  className,
  children,
  ...rest
}: {
  title: string;
  /** Qué pasa exactamente, incluido lo que NO se pierde. */
  description: string;
  /** El verbo, repetido. "Aceptar" no dice a qué se está accediendo. */
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "title">) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={className}
        {...rest}
      >
        {children}
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={() => onConfirm()}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
