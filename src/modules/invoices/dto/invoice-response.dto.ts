export interface InvoiceResponseDto {
  id: string;
  tipoDoc: string;
  serie: string;
  correlativo: number;
  fechaEmision: string;
  clienteNombre: string;
  clienteNumDoc: string;
  moneda: string;
  totalVenta: number;
  status: string;
  sunatCode?: string;
  sunatMessage?: string;
  xmlHash?: string;
  createdAt: string;
}
