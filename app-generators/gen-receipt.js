// Generates scrInvReceipt.pa.yaml (2026-10-19): the recipient's receipt screen, opened from the email link
// (?receipt=<id>) or from Home. No navigation; everything comes from the "Inventory - My Receipts" flow (Get / Acknowledge /
// Resend), so recipients need no access to the inventory lists. States follow the user's mockup:
//   ready (review + I Acknowledge) -> processing -> success; acknowledged (return visit); denied (someone else's receipt);
//   superseded / invalid (link not available); voided / closed (no longer available); cac (signed on paper).
// node app-generators/gen-receipt.js
const fs = require('fs');
const path = require('path');

// ---------- tiny YAML writer ----------
const risky = (v) => /: | #|^\s|\n|^[|>]/.test(v);
function props(obj, ind) {
  const pad = ' '.repeat(ind);
  return Object.entries(obj).map(([k, v]) => {
    if (k.startsWith('#')) return `${pad}# ${v}`;
    const s = String(v);
    if (risky(s)) return `${pad}${k}: |-\n` + s.split('\n').map((l) => `${pad}  ${l}`).join('\n');
    return `${pad}${k}: ${s}`;
  }).join('\n');
}
function node(name, control, p, children, ind, variant) {
  const pad = ' '.repeat(ind);
  let out = `${pad}- ${name}:\n${pad}    Control: ${control}\n`;
  if (variant) out += `${pad}    Variant: ${variant}\n`;
  out += `${pad}    Properties:\n${props(p, ind + 6)}\n`;
  if (children && children.length) out += `${pad}    Children:\n` + children.map((c) => c(ind + 6)).join('');
  return out;
}
const q = (t) => `"${t.replace(/"/g, '""')}"`;
const flat = { RadiusBottomLeft: '=0', RadiusBottomRight: '=0', RadiusTopLeft: '=0', RadiusTopRight: '=0' };
const rad = (r) => ({ RadiusBottomLeft: `=${r}`, RadiusBottomRight: `=${r}`, RadiusTopLeft: `=${r}`, RadiusTopRight: `=${r}` });

const C = {
  navy: 'RGBA(11, 42, 74, 1)', blue: 'RGBA(26, 95, 208, 1)', ink: 'RGBA(26, 32, 44, 1)', grey: 'RGBA(84, 96, 112, 1)',
  line: 'RGBA(214, 220, 228, 1)', page: 'RGBA(244, 246, 249, 1)', white: 'RGBA(255, 255, 255, 1)',
  green: 'RGBA(30, 128, 60, 1)', greenBg: 'RGBA(233, 246, 236, 1)', blueBg: 'RGBA(236, 243, 253, 1)',
  red: 'RGBA(196, 30, 42, 1)', amber: 'RGBA(214, 140, 0, 1)',
};

// Stacked (vertical) sections stretch their children to full width unless told otherwise (2026-10-19: text was
// squeezed into narrow columns on the first run).
const box = (name, p, kids, variant = 'AutoLayout') => (ind) => node(name, 'GroupContainer', {
  DropShadow: '=DropShadow.None', LayoutMinHeight: '=0', LayoutMinWidth: '=0', ...flat,
  ...(p.LayoutDirection === '=LayoutDirection.Vertical' && !p.LayoutAlignItems ? { LayoutAlignItems: '=LayoutAlignItems.Stretch' } : {}),
  ...p,
}, kids, ind, variant);
const text = (name, p) => (ind) => node(name, 'ModernText', {
  AccessibleLabel: '=Self.Text', Color: `=${C.ink}`, LayoutMinWidth: '=0', PaddingBottom: '=0', PaddingLeft: '=0', PaddingTop: '=0', ...p,
}, null, ind);
const button = (name, p) => (ind) => node(name, 'ModernButton', { LayoutMinWidth: '=0', Height: '=44', ...p }, null, ind);
const img = (name, kind, color, size, p = {}) => (ind) => node(name, 'Image', {
  AccessibleLabel: '=""', Height: `=${size}`, Width: `=${size}`, Image: `=fxRcIcon(${q(kind)}, ${q(color)})`, ...p,
}, null, ind);

// Card width and the estimated height of wrapped text (ModernText does not grow by itself).
const W = 'Min(760, App.Width - 32)';
const lines = (expr, size, width) => `Max(1, RoundUp(Len(${expr}) * ${(size * 0.55).toFixed(2)} / (${width}), 0))`;
const textH = (expr, size, width) => `${lines(expr, size, width)} * ${Math.round(size * 1.45)} + 6`;

// ---------- data ----------
const ST = 'locRc.State';
const VIEW = 'locRcStep = "view"';
const isState = (...s) => `${VIEW} && ${ST} in [${s.map(q).join(', ')}]`;
const LOAD = [
  '=// The receipt from "Inventory - My Receipts" (Get). Untyped JSON -> typed record and tables.',
  '// A refresh of a receipt already on screen (the PDF check) keeps it visible instead of showing the spinner.',
  'If(!(locRcStep in ["view", "processing"]), UpdateContext({locRcStep: "load"}));',
  'IfError(',
  '    With(',
  '        {r: ParseJSON(\'Inventory-MyReceipts\'.Run(JSON({action: "Get", receiptId: gblInvRcId}, JSONFormat.Compact)).response)},',
  '        UpdateContext({locRc: {',
  '            State: Text(r.state), Contact: Text(r.contact),',
  '            Id: Value(r.receipt.id), Number: Text(r.receipt.number), IssueDate: Text(r.receipt.issueDate), ReturnDate: Text(r.receipt.returnDate),',
  '            IssuedTo: Text(r.receipt.issuedTo), Org: Text(r.receipt.organization), OrgAcct: Text(r.receipt.orgAccountNo), Office: Text(r.receipt.issuingOffice),',
  '            IssuedBy: Text(r.receipt.issuedBy), SupersededBy: Text(r.receipt.supersededBy),',
  '            AckBy: Text(r.receipt.ackBy), AckDate: Text(r.receipt.ackDate),',
  '            PdfReady: Coalesce(Boolean(r.receipt.pdfReady), false), PdfUrl: Text(r.receipt.pdfUrl), ResendPending: Coalesce(Boolean(r.receipt.resendPending), false),',
  '            AckText: Text(r.ackText), CheckboxText: Text(r.checkboxText), Version: Text(r.version),',
  '            Conditions: Concat(ForAll(Sequence(CountRows(Table(r.conditions))), Value & ". " & Text(Index(Table(r.conditions), Value).Value)), Value, Char(10))',
  '        }});',
  '        ClearCollect(colRcItems, ForAll(Table(r.items) As i, {Qty: Value(i.Value.qty), Desc: Text(i.Value.description), Tag: Text(i.Value.tag), Serial: Text(i.Value.serial)}));',
  '        UpdateContext({locRcStep: "view"})',
  '    ),',
  '    UpdateContext({locRcStep: "error"})',
  ')',
].join('\n');
const ACK = [
  '=UpdateContext({locRcStep: "processing", locRcProc: 0});',
  'With(',
  '    {r: IfError(ParseJSON(\'Inventory-MyReceipts\'.Run(JSON({action: "Acknowledge", receiptId: gblInvRcId, ackVersion: locRc.Version}, JSONFormat.Compact)).response), Blank())},',
  '    If(',
  '        IsBlank(r), UpdateContext({locRcStep: "view", locRcError: "Your acknowledgement couldn\'t be saved. Check your connection and try again."}),',
  '        Text(r.status) <> "Success", UpdateContext({locRcStep: "view", locRcError: Text(r.message)}),',
  '        UpdateContext({locRcProc: 5, locRcJustDone: true, locRcError: ""}); Select(btnInvRcLoad)',
  '    )',
  ')',
].join('\n');
const RESEND = [
  '=UpdateContext({locRcBusy: true});',
  'With(',
  '    {r: IfError(ParseJSON(\'Inventory-MyReceipts\'.Run(JSON({action: "Resend", receiptId: gblInvRcId}, JSONFormat.Compact)).response), Blank())},',
  '    UpdateContext({locRcBusy: false});',
  '    Notify(If(IsBlank(r), "The copy couldn\'t be requested. Try again in a minute.", Text(r.message)), If(!IsBlank(r) && Text(r.status) = "Success", NotificationType.Success, NotificationType.Error), 8000);',
  '    If(!IsBlank(r) && Text(r.status) = "Success", UpdateContext({locRc: Patch(locRc, {ResendPending: true})}))',
  ')',
].join('\n');

// ---------- pieces ----------
const cell = (id, label, value) => box(`conInvRc${id}`, {
  FillPortions: '=1', Height: '=56', LayoutDirection: '=LayoutDirection.Vertical', LayoutGap: '=2',
  PaddingLeft: '=10', PaddingTop: '=6', BorderColor: `=${C.line}`, BorderThickness: '=1',
}, [
  text(`txtInvRc${id}Lbl`, { Color: `=${C.grey}`, Height: '=18', Size: '=11', Text: `=${q(label)}`, Wrap: '=false' }),
  text(`txtInvRc${id}Val`, { FontWeight: '=FontWeight.Semibold', Height: '=24', Size: '=13', Text: `=${value}`, Wrap: '=false' }),
]);
const gridRow = (id, cells) => box(`conInvRc${id}`, {
  FillPortions: '=0', Height: '=56', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Stretch',
}, cells);
// Detail row on the success / return-visit card: icon, label, value.
const detail = (id, icon, label, value, extra = {}) => box(`conInvRc${id}`, {
  FillPortions: '=0', Height: '=58', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Center', LayoutGap: '=14',
  PaddingLeft: '=16', ...extra,
}, [
  img(`imgInvRc${id}`, icon, '#1F2937', 26),
  box(`conInvRc${id}Txt`, { FillPortions: '=1', Height: '=46', LayoutDirection: '=LayoutDirection.Vertical', LayoutJustifyContent: '=LayoutJustifyContent.Center' }, [
    text(`txtInvRc${id}Lbl`, { Color: `=${C.grey}`, Height: '=18', Size: '=12', Text: `=${q(label)}`, Wrap: '=false' }),
    text(`txtInvRc${id}Val`, { FontWeight: '=FontWeight.Semibold', Height: '=24', Size: '=14', Text: `=${value}`, Wrap: '=false' }),
  ]),
]);

// Message card (states 5-7 in the mockup, plus CAC and errors).
const MSG = {
  denied: ['lock', '#C41E2A', 'Access Restricted', 'This link is for a specific equipment receipt. You do not have access to view this receipt.'],
  invalid: ['warning', '#D68C00', 'Link Not Available', 'This link is no longer valid or has expired. If you believe you received this message in error, please contact IT Support.'],
  superseded: ['warning', '#D68C00', 'Link Not Available', 'This link is no longer valid or has expired. If you believe you received this message in error, please contact IT Support.'],
  voided: ['ban', '#1F2937', 'Receipt No Longer Available', 'This equipment receipt has been cancelled or is no longer available for acknowledgement. If you have questions, please contact your IT Support.'],
  closed: ['ban', '#1F2937', 'Receipt No Longer Available', 'This equipment receipt has been cancelled or is no longer available for acknowledgement. If you have questions, please contact your IT Support.'],
  cac: ['doc', '#1A5FD0', 'Sign With Your CAC', 'This receipt is signed with your CAC instead of in the app. IT Support will give you the receipt to sign.'],
};
const msgPick = (i) => `Switch(If(locRcStep = "error", "error", ${ST}), ${Object.entries(MSG).map(([k, v]) => `${q(k)}, ${q(v[i])}`).join(', ')}, ${q(i === 0 ? 'warning' : i === 1 ? '#D68C00' : i === 2 ? 'Something Went Wrong' : "The receipt service couldn't be reached. Check your connection and try again.")})`;
const msgText = msgPick(3).replace('Switch(If(locRcStep = "error", "error", locRc.State), ', 'Switch(If(locRcStep = "error", "error", locRc.State), ');

// ---------- screen ----------
const bar = box('conInvRcBar', {
  Fill: `=${C.navy}`, FillPortions: '=0', Height: '=64', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Center',
  LayoutGap: '=12', PaddingLeft: '=20', PaddingRight: '=20',
}, [
  button('btnInvRcBack', { AccessibleLabel: '="Back to Home"', Appearance: '=ButtonAppearance.Secondary', Height: '=36', Icon: '="ArrowLeft"', OnSelect: '=Set(gblInvRcFromHome, false); Set(gblInvRcId, 0); Navigate(scrInvHome, ScreenTransition.None)', Text: '="Home"', Visible: '=gblInvRcFromHome', Width: '=100' }),
  (ind) => node('imgInvRcLogo', 'Image', { AccessibleLabel: '="USAF Special Operations School patch"', Height: '=48', Image: '=fxUsafsosPatch', Width: '=48' }, null, ind),
  text('txtInvRcOrg', { Color: `=${C.white}`, FillPortions: '=1', FontWeight: '=FontWeight.Bold', Height: '=40', Size: '=16', Text: '="USAFSOS Inventory"', Wrap: '=false' }),
  text('txtInvRcBarT1', { Align: '=Align.Right', Color: `=${C.white}`, FontWeight: '=FontWeight.Semibold', Height: '=40', Size: '=14', Text: '="Equipment Receipt"', Width: '=180', Wrap: '=false' }),
]);

const IW = `${W} - 48`; // text width inside the card (24 px padding each side)
const condText = 'locRc.Conditions';
const formH = [
  '56 + 56 + 56 + 30 + 30', // header, two grid rows, "Equipment issued", column heads
  'Max(1, CountRows(colRcItems)) * 48',
  `30 + ${lines(condText, 12, IW)} * 17 + CountRows(Split(${condText}, Char(10))) * 17 + 16`,
].join(' + ');

const head = box('conInvRcHead', {
  Fill: `=${C.blueBg}`, FillPortions: '=0', Height: '=76', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Center',
  LayoutGap: '=14', LayoutJustifyContent: '=LayoutJustifyContent.Center', Width: `=${W}`, AlignInContainer: '=AlignInContainer.Center', ...rad(8), Visible: `=${isState('ready')}`,
}, [
  img('imgInvRcHead', 'doc', '#0B2A4A', 36),
  box('conInvRcHeadTxt', { Width: '=360', Height: '=56', LayoutDirection: '=LayoutDirection.Vertical', LayoutJustifyContent: '=LayoutJustifyContent.Center' }, [
    text('txtInvRcHeadT', { Color: `=${C.navy}`, FontWeight: '=FontWeight.Bold', Height: '=28', Size: '=18', Text: '="Equipment Receipt Acknowledgement"', Wrap: '=false' }),
    text('txtInvRcHeadS', { Color: `=${C.grey}`, Height: '=22', Size: '=13', Text: '="Please review the equipment details below."', Wrap: '=false' }),
  ]),
]);

const form = box('conInvRcForm', {
  AlignInContainer: '=AlignInContainer.Center', BorderColor: `=${C.ink}`, BorderThickness: '=1', Fill: `=${C.white}`, FillPortions: '=0',
  Height: `=${formH}`, LayoutDirection: '=LayoutDirection.Vertical', Width: `=${W}`, Visible: `=${isState('ready')}`,
}, [
  box('conInvRcFormTop', { FillPortions: '=0', Height: '=56', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Center', PaddingLeft: '=16', PaddingRight: '=12', BorderColor: `=${C.line}`, BorderThickness: '=1' }, [
    box('conInvRcFormTopSp', { Height: '=10', Width: '=120' }, []),
    box('conInvRcFormTopL', { FillPortions: '=1', Height: '=48', LayoutDirection: '=LayoutDirection.Vertical', LayoutJustifyContent: '=LayoutJustifyContent.Center' }, [
      text('txtInvRcDept', { Align: '=Align.Center', FontWeight: '=FontWeight.Semibold', Height: '=20', Size: '=12', Text: '="DEPARTMENT OF THE AIR FORCE"', Wrap: '=false' }),
      text('txtInvRcTir', { Align: '=Align.Center', FontWeight: '=FontWeight.Semibold', Height: '=20', Size: '=12', Text: '="TEMPORARY ISSUE RECEIPT"', Wrap: '=false' }),
    ]),
    box('conInvRcFormTopR', { Height: '=50', Width: '=120', LayoutDirection: '=LayoutDirection.Vertical', LayoutJustifyContent: '=LayoutJustifyContent.Center' }, [
      text('txtInvRcFormNo', { Align: '=Align.Right', FontWeight: '=FontWeight.Bold', Height: '=18', Size: '=12', Text: '="DAF Form 1297"', Wrap: '=false' }),
      text('txtInvRcFormDate', { Align: '=Align.Right', Height: '=16', Size: '=11', Text: '="20260323"', Wrap: '=false' }),
      text('txtInvRcFormPage', { Align: '=Align.Right', Height: '=16', Size: '=11', Text: '="Page 1 of 1"', Wrap: '=false' }),
    ]),
  ]),
  gridRow('Row1', [cell('No', 'Receipt Number', 'locRc.Number'), cell('Iss', 'Issue Date', 'locRc.IssueDate'), cell('Ret', 'Return Date', 'locRc.ReturnDate')]),
  gridRow('Row2', [cell('To', 'Issued To', 'locRc.IssuedTo'), cell('OrgV', 'ORGN Account No.', 'Coalesce(locRc.OrgAcct, "–")'), cell('Off', 'Issuing Office', 'Coalesce(locRc.Office, "–")')]),
  text('txtInvRcEqLbl', { FontWeight: '=FontWeight.Bold', Height: '=30', PaddingLeft: '=12', Size: '=12', Text: '="EQUIPMENT ISSUED"', Wrap: '=false' }),
  box('conInvRcCols', { Fill: 'RGBA(246, 247, 249, 1)'.replace(/^/, '='), FillPortions: '=0', Height: '=30', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Center', PaddingLeft: '=12', PaddingRight: '=12', LayoutGap: '=8', BorderColor: `=${C.line}`, BorderThickness: '=1' }, [
    text('txtInvRcColQ', { Height: '=24', Size: '=11', Text: '="QTY"', Width: '=40', Wrap: '=false' }),
    text('txtInvRcColD', { FillPortions: '=3', Height: '=24', Size: '=11', Text: '="DESCRIPTION"', Wrap: '=false' }),
    text('txtInvRcColA', { FillPortions: '=2', Height: '=24', Size: '=11', Text: '="ASSET NUMBER / SERIAL NUMBER"', Wrap: '=false' }),
  ]),
  (ind) => node('galInvRcItems', 'Gallery', {
    AccessibleLabel: '="Equipment issued"', FillPortions: '=0', Height: '=Max(1, CountRows(colRcItems)) * 48', Items: '=colRcItems',
    LayoutMinHeight: '=0', LayoutMinWidth: '=0', ShowScrollbar: '=false', TabIndex: '=0', TemplatePadding: '=0', TemplateSize: '=48',
  }, [
    box('conInvRcItemRow', { Height: '=Parent.TemplateHeight', Width: '=Parent.TemplateWidth', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Center', PaddingLeft: '=12', PaddingRight: '=12', LayoutGap: '=8', BorderColor: `=${C.line}`, BorderThickness: '=1' }, [
      text('txtInvRcItQ', { Height: '=24', Size: '=13', Text: '=ThisItem.Qty', Width: '=40', Wrap: '=false' }),
      text('txtInvRcItD', { FillPortions: '=3', Height: '=40', Size: '=13', Text: '=ThisItem.Desc' }),
      text('txtInvRcItA', { FillPortions: '=2', Height: '=40', Size: '=13', Text: '=ThisItem.Tag & If(IsBlank(ThisItem.Serial), "", " / " & ThisItem.Serial)' }),
    ]),
  ], ind, 'Vertical'),
  text('txtInvRcCondLbl', { FontWeight: '=FontWeight.Bold', Height: '=30', PaddingLeft: '=12', PaddingTop: '=8', Size: '=12', Text: '="CONDITIONS OF ISSUE"', Wrap: '=false' }),
  text('txtInvRcCond', { Height: `=${lines(condText, 12, IW)} * 17 + CountRows(Split(${condText}, Char(10))) * 17 + 8`, PaddingLeft: '=12', PaddingRight: '=12', Size: '=12', Text: `=${condText}` }),
]);

const sign = box('conInvRcSign', {
  AlignInContainer: '=AlignInContainer.Center', FillPortions: '=0',
  Height: `=${textH('locRc.CheckboxText', 13, `${W} - 60`)} + 16 + 52 + If(IsBlank(locRcError), 0, 40)`,
  LayoutDirection: '=LayoutDirection.Vertical', LayoutGap: '=8', Width: `=${W}`, Visible: `=${isState('ready')}`,
}, [
  box('conInvRcCheck', { FillPortions: '=0', Height: `=${textH('locRc.CheckboxText', 13, `${W} - 60`)} + 8`, LayoutDirection: '=LayoutDirection.Horizontal', LayoutGap: '=8' }, [
    (ind) => node('chkInvRcAgree', 'ModernCheckbox', {
      AccessibleLabel: '=locRc.CheckboxText', Default: '=false', Label: '=""', LayoutMinWidth: '=0', Width: '=32',
      OnCheck: '=UpdateContext({locRcChecked: true})', OnUncheck: '=UpdateContext({locRcChecked: false})',
    }, null, ind),
    text('txtInvRcAgree', { FillPortions: '=1', Height: `=${textH('locRc.CheckboxText', 13, `${W} - 60`)}`, Size: '=13', Text: '=locRc.CheckboxText' }),
  ]),
  text('txtInvRcErr', { Color: `=${C.red}`, Height: '=36', Size: '=13', Text: '=locRcError', Visible: '=!IsBlank(locRcError)' }),
  button('btnInvRcAck', {
    AccessibleLabel: '="I Acknowledge receipt " & locRc.Number', DisplayMode: '=If(locRcChecked, DisplayMode.Edit, DisplayMode.Disabled)',
    Icon: '="CheckmarkCircle"', OnSelect: ACK, Text: '="I Acknowledge"', Width: '=Parent.Width',
  }),
]);

const STEPS = ['Validating your identity', 'Recording acknowledgement', 'Generating completed receipt', 'Saving to secure records', 'Sending confirmation email'];
const proc = box('conInvRcProc', {
  AlignInContainer: '=AlignInContainer.Center', Fill: `=${C.white}`, FillPortions: '=0', Height: `=${40 + 64 + 40 + 50 + 20 + STEPS.length * 44 + 30}`,
  LayoutAlignItems: '=LayoutAlignItems.Center', LayoutDirection: '=LayoutDirection.Vertical', LayoutGap: '=10', PaddingTop: '=40',
  Width: `=${W}`, ...rad(8), Visible: '=locRcStep = "processing"',
}, [
  (ind) => node('spnInvRc', 'ModernSpinner', { AccessibleLabel: '="Processing"', Label: '=""', LayoutMinWidth: '=0', Height: '=64', Width: '=64' }, null, ind),
  text('txtInvRcProcT', { Align: '=Align.Center', Color: `=${C.navy}`, FontWeight: '=FontWeight.Bold', Height: '=34', Size: '=20', Text: '="Processing Your Acknowledgement"', Width: '=Parent.Width', Wrap: '=false' }),
  text('txtInvRcProcS', { Align: '=Align.Center', Color: `=${C.grey}`, Height: '=46', PaddingLeft: '=24', PaddingRight: '=24', Size: '=13', Text: '="Please wait while we record your acknowledgement and generate the completed receipt."', Width: '=Parent.Width' }),
  box('conInvRcSteps', { BorderColor: `=${C.line}`, BorderThickness: '=1', Height: `=${STEPS.length * 44 + 12}`, LayoutDirection: '=LayoutDirection.Vertical', PaddingLeft: '=16', PaddingTop: '=6', Width: '=Parent.Width - 64', ...rad(8) },
    STEPS.map((s, i) => box(`conInvRcStep${i}`, { FillPortions: '=0', Height: '=44', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Center', LayoutGap: '=12' }, [
      (ind) => node(`imgInvRcStep${i}`, 'Image', { AccessibleLabel: '=""', Height: '=22', Width: '=22', Visible: `=locRcProc <> ${i}`, Image: `=If(locRcProc > ${i}, fxRcIcon("check", "#1E803C"), fxRcIcon("todo", "#B8C0CC"))` }, null, ind),
      (ind) => node(`spnInvRcStep${i}`, 'ModernSpinner', { AccessibleLabel: `=${q(s + ', in progress')}`, Label: '=""', LayoutMinWidth: '=0', Height: '=22', Width: '=22', Visible: `=locRcProc = ${i}` }, null, ind),
      text(`txtInvRcStep${i}`, { Color: `=If(locRcProc >= ${i}, ${C.ink}, ${C.grey})`, FillPortions: '=1', Height: '=24', Size: '=13', Text: `=${q(s)}`, Wrap: '=false' }),
    ]))),
]);

const done = box('conInvRcDone', {
  AlignInContainer: '=AlignInContainer.Center', FillPortions: '=0',
  Height: '=210 + 12 + 4 * 58 + 24 + 12 + 52 + If(locRc.PdfReady, 52 + 8, 0) + 12 + 76',
  LayoutDirection: '=LayoutDirection.Vertical', LayoutGap: '=12', Width: `=${W}`, Visible: `=${isState('acknowledged')}`,
}, [
  box('conInvRcBanner', {
    Fill: `=If(locRcJustDone, ${C.greenBg}, ${C.blueBg})`, FillPortions: '=0', Height: '=210', LayoutAlignItems: '=LayoutAlignItems.Center',
    LayoutDirection: '=LayoutDirection.Vertical', LayoutGap: '=6', PaddingTop: '=20', ...rad(8),
  }, [
    (ind) => node('imgInvRcBanner', 'Image', { AccessibleLabel: '=""', Height: '=56', Width: '=56', Image: '=fxRcIcon(If(locRcJustDone, "check", "doc"), If(locRcJustDone, "#1E803C", "#0B2A4A"))' }, null, ind),
    text('txtInvRcBanT', { Align: '=Align.Center', Color: `=${C.navy}`, FontWeight: '=FontWeight.Bold', Height: '=34', Size: '=22', Text: '=If(locRcJustDone, "Thank You!", "Already Acknowledged")', Width: '=Parent.Width', Wrap: '=false' }),
    text('txtInvRcBanS', { Align: '=Align.Center', Color: `=If(locRcJustDone, ${C.green}, ${C.ink})`, FontWeight: '=If(locRcJustDone, FontWeight.Semibold, FontWeight.Normal)', Height: '=24', Size: '=14', Text: '=If(locRcJustDone, "Your acknowledgement has been recorded.", "This equipment receipt has already been acknowledged.")', Width: '=Parent.Width', Wrap: '=false' }),
    text('txtInvRcBanX', { Align: '=Align.Center', Color: `=${C.grey}`, Height: '=46', PaddingLeft: '=24', PaddingRight: '=24', Size: '=13', Text: '=If(!locRcJustDone, "You can view or download a copy of your receipt below.", locRc.PdfReady, "The completed receipt has been saved to our records and a copy has been emailed to you.", "Your completed receipt is being prepared. A copy will be emailed to you as soon as it is ready.")', Width: '=Parent.Width' }),
  ]),
  box('conInvRcDetails', { BorderColor: `=${C.line}`, BorderThickness: '=1', Fill: `=${C.white}`, FillPortions: '=0', Height: '=4 * 58 + 24', LayoutDirection: '=LayoutDirection.Vertical', PaddingTop: '=12', ...rad(8) }, [
    detail('DNo', 'doc', 'Receipt Number', 'locRc.Number'),
    detail('DBy', 'person', 'Acknowledged By', 'locRc.AckBy'),
    detail('DDate', 'calendar', 'Acknowledgement Date', 'locRc.AckDate'),
    box('conInvRcDStat', { FillPortions: '=0', Height: '=58', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Center', LayoutGap: '=14', PaddingLeft: '=16' }, [
      img('imgInvRcDStat', 'circlecheck', '#1F2937', 26),
      box('conInvRcDStatTxt', { FillPortions: '=1', Height: '=52', LayoutDirection: '=LayoutDirection.Vertical', LayoutJustifyContent: '=LayoutJustifyContent.Center' }, [
        text('txtInvRcDStatLbl', { Color: `=${C.grey}`, Height: '=18', Size: '=12', Text: '="Status"', Wrap: '=false' }),
        text('txtInvRcDStatVal', { Color: `=${C.green}`, Fill: `=${C.greenBg}`, FontWeight: '=FontWeight.Semibold', Height: '=28', PaddingLeft: '=10', Size: '=13', Text: '="Acknowledged"', Width: '=130', Wrap: '=false', ...rad(4) }),
      ]),
    ]),
  ]),
  button('btnInvRcPdf', {
    AccessibleLabel: '="View or download the completed receipt (PDF)"', DisplayMode: '=If(locRc.PdfReady, DisplayMode.Edit, DisplayMode.Disabled)',
    FontWeight: '=FontWeight.Bold', Icon: '="ArrowDownload"', IconStyle: '=IconStyle.Filled', OnSelect: '=Launch(locRc.PdfUrl)', Text: '=If(locRc.PdfReady, "View / Download Completed Receipt (PDF)", "Completed receipt (PDF) is being prepared…")', Width: '=Parent.Width',
  }),
  button('btnInvRcResend', {
    AccessibleLabel: '="Send another copy to my email"', Appearance: '=ButtonAppearance.Secondary',
    DisplayMode: '=If(locRcBusy || locRc.ResendPending, DisplayMode.Disabled, DisplayMode.Edit)', Icon: '="Mail"', OnSelect: RESEND,
    Text: '=If(locRc.ResendPending, "A copy is on its way to your email", "Send Another Copy to My Email")', Visible: '=locRc.PdfReady', Width: '=Parent.Width',
  }),
  box('conInvRcNote', { Fill: `=${C.blueBg}`, FillPortions: '=0', Height: '=76', LayoutDirection: '=LayoutDirection.Horizontal', LayoutAlignItems: '=LayoutAlignItems.Center', LayoutGap: '=12', PaddingLeft: '=16', PaddingRight: '=16', ...rad(8) }, [
    img('imgInvRcNote', 'info', '#1A5FD0', 24),
    box('conInvRcNoteTxt', { FillPortions: '=1', Height: '=60', LayoutDirection: '=LayoutDirection.Vertical', LayoutJustifyContent: '=LayoutJustifyContent.Center' }, [
      text('txtInvRcNoteT', { FontWeight: '=FontWeight.Semibold', Height: '=22', Size: '=13', Text: '=If(locRcJustDone, "You may safely close this window.", "Need another copy?")', Wrap: '=false' }),
      text('txtInvRcNoteS', { Color: `=${C.grey}`, Height: '=36', Size: '=12', Text: '=If(locRcJustDone, "A copy of the completed receipt has been sent to your email.", "A copy was also sent to your email. You can use this link at any time to view your completed receipt.")' }),
    ]),
  ]),
]);

const MSG_STATES = [...Object.keys(MSG)];
const msg = box('conInvRcMsg', {
  AlignInContainer: '=AlignInContainer.Center', BorderColor: `=${C.line}`, BorderThickness: '=1', Fill: `=${C.white}`, FillPortions: '=0', Height: '=300',
  LayoutAlignItems: '=LayoutAlignItems.Center', LayoutDirection: '=LayoutDirection.Vertical', LayoutGap: '=10', PaddingTop: '=36', Width: `=${W}`, ...rad(8),
  Visible: `=locRcStep = "error" || ${isState(...MSG_STATES)}`,
}, [
  (ind) => node('imgInvRcMsg', 'Image', { AccessibleLabel: '=""', Height: '=52', Width: '=52', Image: `=fxRcIcon(${msgPick(0)}, ${msgPick(1)})` }, null, ind),
  text('txtInvRcMsgT', { Align: '=Align.Center', Color: `=${C.navy}`, FontWeight: '=FontWeight.Bold', Height: '=32', Size: '=19', Text: `=${msgPick(2)}`, Width: '=Parent.Width', Wrap: '=false' }),
  text('txtInvRcMsgS', { Align: '=Align.Center', Color: `=${C.grey}`, Height: '=80', PaddingLeft: '=32', PaddingRight: '=32', Size: '=13', Text: `=${msgText}`, Width: '=Parent.Width' }),
  button('btnInvRcMsg', {
    AccessibleLabel: '=Self.Text', Appearance: '=ButtonAppearance.Secondary',
    Icon: '=If(locRcStep = "error", "ArrowClockwise", locRc.State = "denied", "ArrowLeft", "Mail")',
    OnSelect: '=If(locRcStep = "error", Select(btnInvRcLoad), locRc.State = "denied" || IsBlank(locRc.Contact), Exit(), Launch("mailto:" & locRc.Contact & "?subject=" & EncodeUrl("Equipment receipt " & Coalesce(locRc.Number, "link"))))',
    Text: '=If(locRcStep = "error", "Try Again", locRc.State = "denied" || IsBlank(locRc.Contact), "Close", "Contact IT Support")',
    Width: '=260',
  }),
]);

const loading = box('conInvRcLoading', {
  AlignInContainer: '=AlignInContainer.Center', FillPortions: '=0', Height: '=If(Coalesce(gblConsentWaited, false), 180, 120)', LayoutAlignItems: '=LayoutAlignItems.Center', LayoutDirection: '=LayoutDirection.Vertical',
  LayoutJustifyContent: '=LayoutJustifyContent.Center', Width: `=${W}`, Visible: '=locRcStep = "load"',
}, [
  (ind) => node('spnInvRcLoad', 'ModernSpinner', { AccessibleLabel: '="Loading your receipt"', Label: '="Loading your receipt…"', LayoutMinWidth: '=0', Width: '=220' }, null, ind),
  // Consent hint: opening the link right after a publish can show "Allow … to access your data?" in its own frame.
  (ind) => node('tmrInvRcConsent', 'Timer', { AutoStart: '=true', Duration: '=6000', Height: '=1', OnTimerEnd: '=Set(gblConsentWaited, true)', Visible: '=false', Width: '=1' }, null, ind),
  text('txtInvRcConsent', { Align: '=Align.Center', Color: '=RGBA(131, 82, 0, 1)', Height: '=48', PaddingLeft: '=16', PaddingRight: '=16', Size: '=13', Text: '="Still loading. If you see ""Allow this app to access your data?"", select Allow. If nothing appears, reload the page."', Visible: '=Coalesce(gblConsentWaited, false)', Width: '=Parent.Width' }),
]);

const body = box('conInvRcBody', {
  FillPortions: '=1', LayoutAlignItems: '=LayoutAlignItems.Center', LayoutDirection: '=LayoutDirection.Vertical', LayoutGap: '=16',
  LayoutOverflowY: '=LayoutOverflow.Scroll', PaddingBottom: '=32', PaddingTop: '=20',
}, [loading, head, form, sign, proc, done, msg]);

// Acknowledged but the PDF is still being built (about 30-90 s): check again every 20 s, up to 10 times.
const pdfPoll = (ind) => node('tmrInvRcPdf', 'Timer', {
  Duration: '=20000', Height: '=1', Repeat: '=true', Visible: '=false', Width: '=1',
  OnTimerEnd: '=UpdateContext({locRcPolls: Coalesce(locRcPolls, 0) + 1}); Select(btnInvRcLoad)',
  Start: '=locRcStep = "view" && locRc.State = "acknowledged" && !locRc.PdfReady && Coalesce(locRcPolls, 0) < 10',
}, null, ind);
// Moves the processing list along (about 1.2 s a step); the last step waits for the flow's answer.
const procTick = (ind) => node('tmrInvRcProc', 'Timer', {
  Duration: '=1200', Height: '=1', Repeat: '=true', Visible: '=false', Width: '=1',
  OnTimerEnd: '=If(locRcProc < 4, UpdateContext({locRcProc: locRcProc + 1}))',
  Start: '=locRcStep = "processing" && locRcProc < 4',
}, null, ind);
const loadBtn = button('btnInvRcLoad', { AccessibleLabel: '="Load the receipt"', Height: '=10', OnSelect: LOAD, Text: '="Load"', Visible: '=false', Width: '=10' });

const root = box('conInvRcRoot', {
  Fill: `=${C.page}`, Height: '=Parent.Height', LayoutAlignItems: '=LayoutAlignItems.Stretch', LayoutDirection: '=LayoutDirection.Vertical', Width: '=Parent.Width',
}, [bar, body, loadBtn, pdfPoll, procTick]);

const yaml = [
  'Screens:',
  '  scrInvReceipt:',
  '    Properties:',
  `      Fill: =${C.page}`,
  '      OnVisible: |-',
  '        =// gblInvRcId: from Home ("Review and acknowledge"), else the email link (?receipt=<id>).',
  '        If(IsBlank(gblInvRcId) || gblInvRcId = 0, Set(gblInvRcId, IfError(Value(Param("receipt")), 0)));',
  '        UpdateContext({locRcChecked: false, locRcJustDone: false, locRcBusy: false, locRcError: "", locRcPolls: 0, locRcStep: "load"});',
  '        Reset(chkInvRcAgree);',
  '        Select(btnInvRcLoad)',
  '    Children:',
  root(6),
].join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'scrInvReceipt.pa.yaml'), yaml);
console.log('scrInvReceipt.pa.yaml written', yaml.length);
