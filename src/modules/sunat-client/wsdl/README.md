# WSDLs Estaticos - SUNAT billService

## Por que archivos locales?

SUNAT tiene un WAF (nginx/1.17.3) que bloquea peticiones HTTP con ciertos `User-Agent` headers.
node-soap usa axios internamente y envia `User-Agent: node-soap/1.7.1`, lo cual SUNAT rechaza con **401**.

Las sub-URLs de WSDL (`?ns1.wsdl`, `?xsd2.xsd`) son aun mas estrictas y bloquean casi cualquier cliente HTTP de Node.js.

**Solucion**: descargar los 3 archivos con curl y que node-soap los cargue localmente.

---

## Archivos

```
src/modules/sunat-client/wsdl/
  main.wsdl    <- WSDL principal (definicion del servicio y bindings)
  types.wsdl   <- Sub-WSDL (mensajes y portType)
  types.xsd    <- Schema XSD (tipos de datos: sendBill, sendBillResponse, etc.)
```

Las referencias internas ya estan modificadas para apuntar a archivos locales:
- `main.wsdl` importa `types.wsdl` (en vez de `billService?ns1.wsdl`)
- `types.wsdl` importa `types.xsd` (en vez de `billService.xsd2.xsd`)

---

## Pasos para actualizar los WSDLs

Si SUNAT cambia la estructura del servicio (nuevas operaciones, nuevos tipos), hay que re-descargar.

### 1. Descargar los 3 archivos desde SUNAT beta

```bash
# WSDL principal
curl -s -o main_raw.wsdl "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl"

# Sub-WSDL (tipos y mensajes)
curl -s -o types_raw.wsdl "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?ns1.wsdl"

# Schema XSD (definiciones de tipos)
curl -s -o types_raw.xsd "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?xsd2.xsd"
```

> **Nota**: Usar `curl` porque funciona con el WAF de SUNAT. No usar axios, fetch, ni wget con User-Agent por defecto.

### 2. Modificar las referencias internas

En `main_raw.wsdl`, buscar:
```xml
<wsdl:import location="billService?ns1.wsdl" .../>
```
Cambiar a:
```xml
<wsdl:import location="types.wsdl" .../>
```

En `types_raw.wsdl`, buscar:
```xml
<xsd:import schemaLocation="billService.xsd2.xsd" .../>
```
Cambiar a:
```xml
<xsd:import schemaLocation="types.xsd" .../>
```

### 3. Guardar en la ruta del proyecto

```bash
cp main_raw.wsdl  src/modules/sunat-client/wsdl/main.wsdl
cp types_raw.wsdl  src/modules/sunat-client/wsdl/types.wsdl
cp types_raw.xsd   src/modules/sunat-client/wsdl/types.xsd
```

### 4. Verificar que funciona

```bash
pnpm build
# Reiniciar servidor y enviar una factura de prueba
```

---

## Nota sobre produccion

Los WSDLs de beta y produccion tienen la **misma estructura** (mismas operaciones).
Solo cambia la URL del endpoint, que se sobreescribe en el codigo con `client.setEndpoint()`.
No se necesitan WSDLs separados para produccion.

Si se quisieran descargar desde produccion:
```bash
curl -s -o main_raw.wsdl "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl"
curl -s -o types_raw.wsdl "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?ns1.wsdl"
curl -s -o types_raw.xsd "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?xsd2.xsd"
```
