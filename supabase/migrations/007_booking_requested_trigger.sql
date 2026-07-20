-- A submitted request and a confirmed booking are separate lifecycle events.
-- Preserve any template selections already made for existing triggers.
insert into booking_action_triggers (action, label, sort_order)
values ('booking.requested', 'Request Submitted', 1)
on conflict (action) do update
set label = excluded.label,
    sort_order = excluded.sort_order;

update booking_action_triggers set sort_order = 2 where action = 'booking.confirmed';
update booking_action_triggers set sort_order = 3 where action = 'booking.updated';
update booking_action_triggers set sort_order = 4 where action = 'booking.cancelled';
update booking_action_triggers set sort_order = 5 where action = 'client.followup';

insert into email_templates (name, subject, to_address, body)
values (
  'Booking Request Received',
  'We received your booking request · {{booking_date}}',
  '{{client_email}}',
  $template$
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#242620;line-height:1.6">
    <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#766f66">DNA My Colours</p>
    <h1 style="font-family:Georgia,serif;font-size:34px;font-weight:400;line-height:1.1">Your request is in.</h1>
    <p>Hello {{client_first_name}},</p>
    <p>Thank you for requesting a colour experience with us. Your selected time is being held as a pending request. We will review it and send a separate confirmation email when it is approved.</p>
    <div style="margin:28px 0;padding:22px;border:1px solid #ddd4c8;border-radius:12px;background:#faf7f1">
      <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#766f66">{{offering_name}}</p>
      <p style="margin:0"><strong>{{booking_date}}</strong></p>
      <p style="margin:2px 0">{{booking_start_time}}–{{booking_end_time}}</p>
      <p style="margin:12px 0 0">{{booking_duration_minutes}} minutes · {{booking_price}}</p>
      <p style="margin:4px 0 0">Guests: {{client_count}}</p>
    </div>
    <p><strong>Request reference</strong><br>{{booking_reference}}</p>
    <p style="font-size:13px;color:#766f66">Questions? Reply to this email or contact {{business_email}}.</p>
  </div>
  $template$
)
on conflict (name) do nothing;

update booking_action_triggers
set template_id = (select id from email_templates where name = 'Booking Request Received')
where action = 'booking.requested'
  and template_id is null;

notify pgrst, 'reload schema';
