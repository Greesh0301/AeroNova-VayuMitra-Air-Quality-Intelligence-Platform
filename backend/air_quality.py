                14,
            )
        )
    else:
        entries.append(("Historical weather data is unavailable for this event period.", "F1", 10, 14))

    entries.append(("", "F1", 10, 8))
    entries.append(("4. Pollution Timeline Readings (Before, During, Peak, After)", "F2", 12, 16))
    if not timeline:
        entries.append(("Hourly timeline points were not included in this summary payload.", "F1", 9, 13))
    else:
        entries.append(("Time (Local)         Phase    Conc.         Weather                     Aligned Reports", "F2", 8.5, 13))
        for pt in timeline[:36]:
            t_str = str(pt.get("time") or "").replace("T", " ")[:16].ljust(18)
            ph = ("PEAK" if pt.get("is_peak") else str(pt.get("phase") or "").upper()).ljust(8)
            val_str = f"{pt.get('value', '--')} {unit}".ljust(13)
            w = pt.get("weather") or {}
            wx_str = (
                f"W:{w.get('wind_speed', '-')}km/h T:{w.get('temperature_c', '-')}C".ljust(27)
                if w.get("available")
                else "Weather unavailable        "
            )
            aligned = pt.get("aligned_reports") or []
            rep_codes = ",".join(str(r.get("report_code") or r.get("category") or "") for r in aligned) if aligned else "-"
            entries.append((f"{t_str} {ph} {val_str} {wx_str} {rep_codes}", "F1", 8.5, 12))

    entries.append(("", "F1", 10, 8))
    entries.append(("5. Matching Air Guardian Community Reports", "F2", 12, 16))
    if not reports:
        entries.append(("No matching community reports found for this event.", "F1", 10, 14))
    else:
        for r in reports:
            dist_str = f" | Distance: {r['distance_km']} km" if r.get("distance_km") is not None else ""
            entries.append((f"[{r.get('report_code', 'REP')}] {r.get('title', 'Report')} ({r.get('category', '')}) - Status: {r.get('status', 'Pending')}", "F2", 10, 13))
            entries.append((f"Location: {r.get('location_name', '--')} | Submitted: {r.get('created_at', '--')}{dist_str}", "F1", 9, 12))
            for line in _wrap_pdf_lines(r.get("description") or "", 86):
                entries.append((line, "F1", 9, 12))
            entries.append(("", "F1", 9, 5))

    entries.append(("", "F1", 10, 8))
    entries.append(("6. Evidence-Based Event Explanation", "F2", 12, 16))
    ai_text = str(summary.get("ai_explanation") or "").strip() or "Explanation was not generated for this export."
    for line in _wrap_pdf_lines(ai_text, 88):
        entries.append((line, "F1", 9.5, 13))

    entries.append(("", "F1", 10, 8))
    entries.append(("7. Data Sources & Availability Limitations", "F2", 12, 16))
    aq_src = ds.get("air_quality") or "Open-Meteo Air Quality Historical API"
    wx_src = ", ".join(ds["weather"]) if isinstance(ds.get("weather"), list) else (ds.get("weather") or "Unavailable")
    cm_src = ds.get("community") or "VayuMitra Air Guardian Store"
    for line in _wrap_pdf_lines(f"Air Quality Source: {aq_src}. Historical Weather Source: {wx_src}. Community Source: {cm_src}.", 88):
        entries.append((line, "F1", 9, 12))
    lim_text = (
        "Limitation: Historical weather records were unavailable for part or all of this event window. Citizen reports reflect observational alignment and do not establish physical causation without field verification."
        if not ws.get("available")
        else "Limitation: Regional grid air quality estimates (~10-40 km) may differ from street-level micro-peaks. Citizen reports represent observational correlation within the selected spatial/temporal window and do not prove causation."
    )
    for line in _wrap_pdf_lines(lim_text, 88):
        entries.append((line, "F1", 9, 12))

    pages_ops: List[List[str]] = [[]]
    y = 750
    for text, font, size, lead in entries:
        if y < 54:
            pages_ops.append([])
            y = 750
        if text:
            pages_ops[-1].append(f"BT /{font} {size} Tf 48 {y} Td ({_pdf_escape(text)}) Tj ET")
        y -= lead

    page_obj_nums: List[int] = []
    next_id = 5
    page_objs: List[bytes] = []
    for ops in pages_ops:
        page_id = next_id
        content_id = next_id + 1
        next_id += 2
        page_obj_nums.append(page_id)
        stream_data = "\n".join(ops).encode("latin-1", errors="replace")
        page_objs.append(
            f"{page_id} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_id} 0 R >>\nendobj\n".encode("latin-1")
        )
        page_objs.append(
            f"{content_id} 0 obj\n<< /Length {len(stream_data)} >>\nstream\n".encode("latin-1")
            + stream_data
            + b"\nendstream\nendobj\n"
        )

    kids = " ".join(f"{p} 0 R" for p in page_obj_nums)
    objs: List[bytes] = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        f"2 0 obj\n<< /Type /Pages /Kids [ {kids} ] /Count {len(page_obj_nums)} >>\nendobj\n".encode("latin-1"),
        b"3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
        *page_objs,
    ]

    chunks: List[bytes] = [b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"]
    offset = len(chunks[0])
    offsets = [0]
    for obj in objs:
        offsets.append(offset)
        chunks.append(obj)
        offset += len(obj)

    xref_pos = offset
    xref_lines = [f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n"]
    for off in offsets[1:]:
        xref_lines.append(f"{off:010d} 00000 n \n")
    xref_lines.append(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n")
    chunks.append("".join(xref_lines).encode("latin-1"))

    safe_city = re.sub(r"[^a-zA-Z0-9_-]+", "_", city).strip("_") or "India"
    safe_date = re.sub(r"[^0-9-]+", "", ev_date) or "event"
    return f"VayuMitra_Event_Replay_{safe_city}_{safe_date}.pdf", b"".join(chunks)
