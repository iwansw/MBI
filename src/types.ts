export type UserRole = 'ADMIN' | 'POWER_USER' | 'TECHNICIAN' | 'OPERATOR' | 'MANAGER';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  name: string;
}

export interface Brand {
  id: string;
  name: string;
}

export interface ServiceRequest {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  brand_id: string;
  brand_name?: string;
  model: string;
  serial_number: string;
  issue_description: string;
  accessories?: string;
  status: 'PENDING' | 'ASSIGNED' | 'INSPECTION' | 'APPR-WAIT' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'COMPLETED' | 'CANCELLED' | 'PAID' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  technician_id: string | null;
  technician_name?: string;
  operator_id: string;
  is_warranty: number;
  service_type: 'WALK_IN' | 'ON_SITE';
  request_number: string;
  rejection_reason?: string;
  rejected_by_name?: string;
  service_notes?: string;
  labor_charge: number;
  down_payment: number;
  parts_total?: number;
  billing_status?: string;
  created_at: string;
  updated_at: string;
  has_urgent_pending?: number;
}

export interface ServiceLog {
  id: string;
  service_request_id: string;
  technician_id: string;
  technician_name?: string;
  note: string;
  is_important: number;
  is_responded?: number;
  created_at: string;
}

export interface Part {
  id: string;
  part_number: string;
  name: string;
  brand?: string;
  description?: string;
  price: number;
  cogs: number;
}

export interface ServicePart {
  id: string;
  service_request_id: string;
  part_id: string;
  name: string;
  brand?: string;
  part_number?: string;
  quantity: number;
  price_at_time: number;
  current_price?: number;
}

export interface Billing {
  id: string;
  service_request_id: string;
  service_fee: number;
  total_amount: number;
  status: 'UNPAID' | 'PAID';
  invoice_number: string;
  type: 'QUOTE' | 'INVOICE';
  created_at: string;
}
