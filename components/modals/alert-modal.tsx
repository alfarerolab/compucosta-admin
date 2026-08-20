"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AlertModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  confirmText?: string;
  cancelText?: string;
}

export function AlertModal({
  isOpen,
  title = "¿Estás seguro?",
  description = "Esta acción no se puede deshacer.",
  onClose,
  onConfirm,
  loading = false,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
}: AlertModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2 text-sm text-muted-foreground">
          {description}
        </div>
        <DialogFooter>
          <Button
            disabled={loading}
            variant="outline"
            onClick={onClose}
          >
            {cancelText}
          </Button>
          <Button
            disabled={loading}
            variant="destructive"
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
