import { Router } from "express";
import { db } from "@workspace/db";
import { companiesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import {
  CreateCompanyBody,
  UpdateCompanyParams,
  UpdateCompanyBody,
  DeleteCompanyParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const companies = await db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        address: companiesTable.address,
        createdAt: companiesTable.createdAt,
      })
      .from(companiesTable)
      .where(isNull(companiesTable.parentCompanyId))
      .orderBy(companiesTable.name);
    res.json(
      companies.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [company] = await db
      .insert(companiesTable)
      .values({
        name: parsed.data.name,
        address: parsed.data.address ?? null,
      })
      .returning();
    res.status(201).json({
      id: company.id,
      name: company.name,
      address: company.address,
      createdAt: company.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  const paramsParsed = UpdateCompanyParams.safeParse(req.params);
  const bodyParsed = UpdateCompanyBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success)
    return res.status(400).json({ error: "Invalid data" });
  try {
    const [company] = await db
      .update(companiesTable)
      .set({
        name: bodyParsed.data.name,
        address: bodyParsed.data.address ?? undefined,
      })
      .where(eq(companiesTable.id, paramsParsed.data.id))
      .returning();
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json({
      id: company.id,
      name: company.name,
      address: company.address,
      createdAt: company.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteCompanyParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db.delete(companiesTable).where(eq(companiesTable.id, parsed.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
