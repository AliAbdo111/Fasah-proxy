/**
 * Create-transit-appointment payload (FASAH ZATCA TAS v2 upstream shape).
 *
 * Server implementation:
 * - `services/fasahClient.js` → `createTransitAppointment(params)`
 * - `POST /api/fasah/appointment/transit/create` → `routes/fasahRoutes.js`
 *
 * Auth on this proxy: send the FASAH token in headers (`Authorization: Bearer …`,
 * `x-fasah-token`, or `token`) or set `token` on the JSON body (same as interface).
 */
export interface IApiCreateTransitAppointment {
  port_code: string;
  zone_schedule_id: string;
  purpose: string;
  declaration_number: string;
  fleet_info: {
    licenseNo: string;
    plateCountry: string;
    residentCountry: string;
    vehicleSequenceNumber: string;
    chassisNo: string;
  }[];
  cargo_type: string;
  bayan_appointment?: Record<string, unknown>;
  /** FASAH JWT — headers or JSON body (see module doc). */
  token: string;
  userType: string;
}
