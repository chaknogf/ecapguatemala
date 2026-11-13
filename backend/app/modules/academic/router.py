from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, PrincipalDep, require_permission
from app.core.errors import NotFoundError, PermissionDeniedError
from app.modules.academic import service as svc
from app.modules.academic.schemas import (
    AnnouncementCreate,
    AnnouncementOut,
    CategoryCreate,
    CategoryOut,
    ClassroomCreate,
    ClassroomOut,
    ClassroomUpdate,
    CourseCreate,
    CourseOut,
    CourseUpdate,
    EnrollStudentClassroom,
    EnrollStudentCourse,
    EnrollmentOut,
    GradeCreate,
    GradeOut,
    GradeUpdate,
    LessonCreate,
    LessonOut,
    LessonUpdate,
    ProgressOut,
    ProgressUpdate,
    ResourceCreate,
    ResourceOut,
    ResourceUpdate,
    TeacherAssignCreate,
    TeacherAssignOut,
    UnitCreate,
    UnitOut,
    UnitUpdate,
    DashboardStats,
)

router = APIRouter(prefix="/api/v1", tags=["academic"])

# ---------- Categories ----------
@router.get("/categories", response_model=list[CategoryOut])
def list_categories(session: DbSession, principal: PrincipalDep):
    return svc.list_categories(session)


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryCreate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("courses.manage"))):
    return svc.create_category(session, payload)


# ---------- Courses ----------
@router.get("/courses", response_model=list[CourseOut])
def list_courses(session: DbSession, principal: PrincipalDep, status: str | None = None, search: str | None = None):
    # teachers see courses they own; students see enrolled; admin/editor see all
    if principal.role_code == "teacher":
        # courses where teacher assigned
        assigns = svc.list_teacher_assignments(session, teacher_id=principal.user_id)
        course_ids = {str(a.course_id) for a in assigns if a.course_id}
        courses = svc.list_courses(session, status=status, search=search)
        return [c for c in courses if str(c.id) in course_ids or c.responsible_teacher_id == principal.user_id]
    if principal.role_code == "student":
        enrollments = svc.list_course_enrollments(session, student_id=principal.user_id)
        course_ids = {str(e.course_id) for e in enrollments}
        courses = svc.list_courses(session, status=status, search=search)
        return [c for c in courses if str(c.id) in course_ids]
    return svc.list_courses(session, status=status, search=search)


@router.post("/courses", response_model=CourseOut, status_code=201)
def create_course(payload: CourseCreate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("courses.manage"))):
    c = svc.create_course(session, payload, created_by=principal.user_id)
    svc.log_activity(session, principal.user_id, "create", "course", c.id, payload.name)
    return c


@router.get("/courses/{course_id}", response_model=CourseOut)
def get_course(course_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    c = svc.get_course(session, course_id)
    # access check
    if principal.role_code == "student" and not svc.student_enrolled_course(session, principal.user_id, course_id):
        raise PermissionDeniedError("No tienes acceso a este curso")
    if principal.role_code == "teacher" and not svc.teacher_owns_course(session, principal.user_id, course_id):
        # allow if any classroom owned? fallback: check assignments
        assigns = svc.list_teacher_assignments(session, teacher_id=principal.user_id, course_id=course_id)
        if not assigns and c.responsible_teacher_id != principal.user_id:
            raise PermissionDeniedError("No tienes acceso a este curso")
    return c


@router.patch("/courses/{course_id}", response_model=CourseOut)
def update_course(course_id: uuid.UUID, payload: CourseUpdate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("courses.manage"))):
    c = svc.get_course(session, course_id)
    # teachers cannot manage courses unless admin/editor; courses.manage only admin/editor
    return svc.update_course(session, c, payload)


@router.delete("/courses/{course_id}")
def delete_course(course_id: uuid.UUID, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("courses.manage"))):
    c = svc.get_course(session, course_id)
    svc.delete_course(session, c)
    return {"ok": True}


# ---------- Classrooms ----------
@router.get("/classrooms", response_model=list[ClassroomOut])
def list_classrooms(session: DbSession, principal: PrincipalDep, course_id: uuid.UUID | None = None):
    if principal.role_code == "teacher":
        rooms = svc.list_classrooms(session, course_id=course_id, teacher_id=principal.user_id)
        # also via assignments
        assigns = svc.list_teacher_assignments(session, teacher_id=principal.user_id)
        ids = {str(a.classroom_id) for a in assigns if a.classroom_id}
        allrooms = svc.list_classrooms(session, course_id=course_id)
        extra = [r for r in allrooms if str(r.id) in ids]
        # merge
        seen = {str(r.id) for r in rooms}
        for r in extra:
            if str(r.id) not in seen:
                rooms.append(r)
        return rooms
    if principal.role_code == "student":
        enrollments = svc.list_classroom_enrollments(session, student_id=principal.user_id)
        ids = {str(e.classroom_id) for e in enrollments}
        rooms = svc.list_classrooms(session, course_id=course_id)
        return [r for r in rooms if str(r.id) in ids]
    return svc.list_classrooms(session, course_id=course_id)


@router.post("/classrooms", response_model=ClassroomOut, status_code=201)
def create_classroom(payload: ClassroomCreate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("classrooms.manage"))):
    c = svc.create_classroom(session, payload)
    svc.log_activity(session, principal.user_id, "create", "classroom", c.id, payload.name)
    return c


@router.get("/classrooms/{classroom_id}", response_model=ClassroomOut)
def get_classroom(classroom_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    cr = svc.get_classroom(session, classroom_id)
    if principal.role_code == "student" and not svc.student_in_classroom(session, principal.user_id, classroom_id):
        raise PermissionDeniedError("No tienes acceso a esta aula")
    if principal.role_code == "teacher" and not svc.teacher_owns_classroom(session, principal.user_id, classroom_id):
        raise PermissionDeniedError("No tienes acceso a esta aula")
    return cr


@router.patch("/classrooms/{classroom_id}", response_model=ClassroomOut)
def update_classroom(classroom_id: uuid.UUID, payload: ClassroomUpdate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("classrooms.manage"))):
    cr = svc.get_classroom(session, classroom_id)
    # teachers can manage own classrooms? permission classrooms.manage granted to editor/teacher? teacher has classrooms.own.* not classrooms.manage. Let's allow teachers with ownership.
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, classroom_id):
            raise PermissionDeniedError("No puedes modificar esta aula")
    return svc.update_classroom(session, cr, payload)


@router.delete("/classrooms/{classroom_id}")
def delete_classroom(classroom_id: uuid.UUID, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("classrooms.manage"))):
    cr = svc.get_classroom(session, classroom_id)
    if principal.role_code == "teacher" and not svc.teacher_owns_classroom(session, principal.user_id, classroom_id):
        raise PermissionDeniedError("No puedes eliminar esta aula")
    svc.delete_classroom(session, cr)
    return {"ok": True}


# ---------- Units ----------
@router.get("/classrooms/{classroom_id}/units", response_model=list[UnitOut])
def list_units(classroom_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    cr = svc.get_classroom(session, classroom_id)
    if principal.role_code == "student" and not svc.student_in_classroom(session, principal.user_id, classroom_id):
        raise PermissionDeniedError("Sin acceso")
    if principal.role_code == "teacher" and not svc.teacher_owns_classroom(session, principal.user_id, classroom_id):
        raise PermissionDeniedError("Sin acceso")
    return svc.list_units(session, classroom_id)


@router.post("/units", response_model=UnitOut, status_code=201)
def create_unit(payload: UnitCreate, session: DbSession, principal: PrincipalDep):
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, payload.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    elif not _has_perm(principal, "content.manage"):
        raise PermissionDeniedError("Sin permiso")
    u = svc.create_unit(session, payload)
    svc.log_activity(session, principal.user_id, "create", "unit", u.id, payload.title)
    return u


@router.patch("/units/{unit_id}", response_model=UnitOut)
def update_unit(unit_id: uuid.UUID, payload: UnitUpdate, session: DbSession, principal: PrincipalDep):
    unit = svc.get_unit(session, unit_id)
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, unit.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    u = svc.update_unit(session, unit, payload)
    return u


@router.delete("/units/{unit_id}")
def delete_unit(unit_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    unit = svc.get_unit(session, unit_id)
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, unit.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    svc.delete_unit(session, unit)
    return {"ok": True}


# ---------- Lessons ----------
@router.get("/units/{unit_id}/lessons", response_model=list[LessonOut])
def list_lessons(unit_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    unit = svc.get_unit(session, unit_id)
    if principal.role_code == "student":
        cr = svc.get_classroom(session, unit.classroom_id)
        if not svc.student_in_classroom(session, principal.user_id, unit.classroom_id):
            raise PermissionDeniedError("Sin acceso")
        # only published
        lessons = svc.list_lessons(session, unit_id)
        return [l for l in lessons if l.status == "published"]
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, unit.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    return svc.list_lessons(session, unit_id)


@router.post("/lessons", response_model=LessonOut, status_code=201)
def create_lesson(payload: LessonCreate, session: DbSession, principal: PrincipalDep):
    unit = svc.get_unit(session, payload.unit_id)
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, unit.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    elif not _has_perm(principal, "content.manage"):
        raise PermissionDeniedError("Sin permiso")
    l = svc.create_lesson(session, payload, author_id=principal.user_id)
    svc.log_activity(session, principal.user_id, "create", "lesson", l.id, payload.title)
    return l


@router.patch("/lessons/{lesson_id}", response_model=LessonOut)
def update_lesson(lesson_id: uuid.UUID, payload: LessonUpdate, session: DbSession, principal: PrincipalDep):
    lesson = svc.get_lesson(session, lesson_id)
    unit = svc.get_unit(session, lesson.unit_id)
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, unit.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    l = svc.update_lesson(session, lesson, payload)
    return l


@router.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    lesson = svc.get_lesson(session, lesson_id)
    unit = svc.get_unit(session, lesson.unit_id)
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, unit.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    svc.delete_lesson(session, lesson)
    return {"ok": True}


# ---------- Resources ----------
@router.get("/resources", response_model=list[ResourceOut])
def list_resources(session: DbSession, principal: PrincipalDep, lesson_id: uuid.UUID | None = None, classroom_id: uuid.UUID | None = None, course_id: uuid.UUID | None = None):
    if principal.role_code == "student":
        # only published & visible
        res = svc.list_resources(session, lesson_id=lesson_id, classroom_id=classroom_id, course_id=course_id)
        return [r for r in res if r.visibility == "published"]
    return svc.list_resources(session, lesson_id=lesson_id, classroom_id=classroom_id, course_id=course_id)


@router.post("/resources", response_model=ResourceOut, status_code=201)
def create_resource(payload: ResourceCreate, session: DbSession, principal: PrincipalDep):
    if principal.role_code == "teacher":
        # ownership check if classroom/lesson
        if payload.classroom_id and not svc.teacher_owns_classroom(session, principal.user_id, payload.classroom_id):
            raise PermissionDeniedError("Sin acceso")
        if payload.lesson_id:
            lesson = svc.get_lesson(session, payload.lesson_id)
            unit = svc.get_unit(session, lesson.unit_id)
            if not svc.teacher_owns_classroom(session, principal.user_id, unit.classroom_id):
                raise PermissionDeniedError("Sin acceso")
    elif not _has_perm(principal, "content.manage"):
        raise PermissionDeniedError("Sin permiso")
    r = svc.create_resource(session, payload, created_by=principal.user_id)
    svc.log_activity(session, principal.user_id, "create", "resource", r.id, payload.title)
    return r


@router.patch("/resources/{resource_id}", response_model=ResourceOut)
def update_resource(resource_id: uuid.UUID, payload: ResourceUpdate, session: DbSession, principal: PrincipalDep):
    r = svc.get_resource(session, resource_id)
    if principal.role_code == "teacher":
        if r.classroom_id and not svc.teacher_owns_classroom(session, principal.user_id, r.classroom_id):
            raise PermissionDeniedError("Sin acceso")
        if r.lesson_id:
            lesson = svc.get_lesson(session, r.lesson_id)
            unit = svc.get_unit(session, lesson.unit_id)
            if not svc.teacher_owns_classroom(session, principal.user_id, unit.classroom_id):
                raise PermissionDeniedError("Sin acceso")
    res = svc.update_resource(session, r, payload)
    return res


@router.delete("/resources/{resource_id}")
def delete_resource(resource_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    r = svc.get_resource(session, resource_id)
    if principal.role_code == "teacher":
        if r.classroom_id and not svc.teacher_owns_classroom(session, principal.user_id, r.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    svc.delete_resource(session, r)
    return {"ok": True}


# ---------- Enrollments ----------
@router.post("/enrollments/course", response_model=EnrollmentOut, status_code=201)
def enroll_course(payload: EnrollStudentCourse, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("assignments.manage"))):
    e = svc.enroll_course(session, payload.student_id, payload.course_id)
    return EnrollmentOut(id=e.id, student_id=e.student_id, course_id=e.course_id, status=e.status, enrolled_at=e.enrolled_at)


@router.delete("/enrollments/course/{enrollment_id}")
def unenroll_course(enrollment_id: uuid.UUID, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("assignments.manage"))):
    svc.unenroll_course(session, enrollment_id)
    return {"ok": True}


@router.get("/enrollments/courses", response_model=list[EnrollmentOut])
def list_course_enrollments(session: DbSession, principal: PrincipalDep, course_id: uuid.UUID | None = None, student_id: uuid.UUID | None = None):
    # students can only see their own
    if principal.role_code == "student":
        student_id = principal.user_id
    ens = svc.list_course_enrollments(session, course_id=course_id, student_id=student_id)
    return [EnrollmentOut(id=e.id, student_id=e.student_id, course_id=e.course_id, status=e.status, enrolled_at=e.enrolled_at) for e in ens]


@router.post("/enrollments/classroom", response_model=EnrollmentOut, status_code=201)
def enroll_classroom(payload: EnrollStudentClassroom, session: DbSession, principal: PrincipalDep):
    # allow admin/editor/teacher (teacher only own classroom)
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, payload.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    elif not _has_perm(principal, "assignments.manage"):
        raise PermissionDeniedError("Sin permiso")
    e = svc.enroll_classroom(session, payload.student_id, payload.classroom_id)
    return EnrollmentOut(id=e.id, student_id=e.student_id, classroom_id=e.classroom_id, status=e.status, enrolled_at=e.enrolled_at)


@router.delete("/enrollments/classroom/{enrollment_id}")
def unenroll_classroom(enrollment_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    e = None
    from app.modules.academic.models import ClassroomEnrollment

    e = session.get(ClassroomEnrollment, enrollment_id) if False else None
    # fetch
    from sqlalchemy import select

    ce = session.get(__import__("app.modules.academic.models", fromlist=["ClassroomEnrollment"]).ClassroomEnrollment, enrollment_id)
    if ce is None:
        raise NotFoundError("Asignación no encontrada")
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, ce.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    elif not _has_perm(principal, "assignments.manage"):
        raise PermissionDeniedError("Sin permiso")
    svc.unenroll_classroom(session, enrollment_id)
    return {"ok": True}


@router.get("/enrollments/classrooms", response_model=list[EnrollmentOut])
def list_classroom_enrollments(session: DbSession, principal: PrincipalDep, classroom_id: uuid.UUID | None = None, student_id: uuid.UUID | None = None):
    if principal.role_code == "student":
        student_id = principal.user_id
    if principal.role_code == "teacher" and classroom_id:
        if not svc.teacher_owns_classroom(session, principal.user_id, classroom_id):
            raise PermissionDeniedError("Sin acceso")
    ens = svc.list_classroom_enrollments(session, classroom_id=classroom_id, student_id=student_id)
    return [EnrollmentOut(id=e.id, student_id=e.student_id, classroom_id=e.classroom_id, status=e.status, enrolled_at=e.enrolled_at) for e in ens]


# ---------- Teacher assignments ----------
@router.post("/teacher-assignments", response_model=TeacherAssignOut, status_code=201)
def assign_teacher(payload: TeacherAssignCreate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("assignments.manage"))):
    ta = svc.assign_teacher(session, payload.teacher_id, payload.course_id, payload.classroom_id, payload.role)
    return ta


@router.get("/teacher-assignments", response_model=list[TeacherAssignOut])
def list_teacher_assignments(session: DbSession, principal: PrincipalDep, teacher_id: uuid.UUID | None = None, course_id: uuid.UUID | None = None, classroom_id: uuid.UUID | None = None):
    if principal.role_code == "teacher":
        teacher_id = principal.user_id
    return svc.list_teacher_assignments(session, teacher_id=teacher_id, course_id=course_id, classroom_id=classroom_id)


@router.delete("/teacher-assignments/{assignment_id}")
def remove_teacher_assignment(assignment_id: uuid.UUID, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("assignments.manage"))):
    svc.remove_teacher_assignment(session, assignment_id)
    return {"ok": True}


# ---------- Grades ----------
@router.get("/grades", response_model=list[GradeOut])
def list_grades(session: DbSession, principal: PrincipalDep, student_id: uuid.UUID | None = None, classroom_id: uuid.UUID | None = None):
    if principal.role_code == "student":
        student_id = principal.user_id
    if principal.role_code == "teacher" and classroom_id:
        if not svc.teacher_owns_classroom(session, principal.user_id, classroom_id):
            raise PermissionDeniedError("Sin acceso")
    return svc.list_grades(session, student_id=student_id, classroom_id=classroom_id)


@router.post("/grades", response_model=GradeOut, status_code=201)
def create_grade(payload: GradeCreate, session: DbSession, principal: PrincipalDep):
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, payload.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    elif not _has_perm(principal, "grades.manage"):
        raise PermissionDeniedError("Sin permiso")
    g = svc.create_grade(session, payload, graded_by=principal.user_id)
    svc.log_activity(session, principal.user_id, "grade", "grade", g.id, payload.assessment_name)
    return g


@router.patch("/grades/{grade_id}", response_model=GradeOut)
def update_grade(grade_id: uuid.UUID, payload: GradeUpdate, session: DbSession, principal: PrincipalDep):
    g = svc.get_grade(session, grade_id)
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, g.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    elif not _has_perm(principal, "grades.manage"):
        raise PermissionDeniedError("Sin permiso")
    return svc.update_grade(session, g, payload)


@router.delete("/grades/{grade_id}")
def delete_grade(grade_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    g = svc.get_grade(session, grade_id)
    if principal.role_code == "teacher":
        if not svc.teacher_owns_classroom(session, principal.user_id, g.classroom_id):
            raise PermissionDeniedError("Sin acceso")
    elif not _has_perm(principal, "grades.manage"):
        raise PermissionDeniedError("Sin permiso")
    svc.delete_grade(session, g)
    return {"ok": True}


# ---------- Announcements ----------
@router.get("/announcements", response_model=list[AnnouncementOut])
def list_announcements(session: DbSession, principal: PrincipalDep, course_id: uuid.UUID | None = None, classroom_id: uuid.UUID | None = None):
    if principal.role_code == "student":
        # filter by enrolled courses/classrooms
        pass
    return svc.list_announcements(session, course_id=course_id, classroom_id=classroom_id, target_role=principal.role_code)


@router.post("/announcements", response_model=AnnouncementOut, status_code=201)
def create_announcement(payload: AnnouncementCreate, session: DbSession, principal: PrincipalDep):
    if principal.role_code == "teacher":
        if payload.classroom_id and not svc.teacher_owns_classroom(session, principal.user_id, payload.classroom_id):
            raise PermissionDeniedError("Sin acceso")
        if payload.course_id and not svc.teacher_owns_course(session, principal.user_id, payload.course_id):
            raise PermissionDeniedError("Sin acceso")
    a = svc.create_announcement(session, payload, author_id=principal.user_id)
    svc.log_activity(session, principal.user_id, "create", "announcement", a.id, payload.title)
    return a


@router.delete("/announcements/{announcement_id}")
def delete_announcement(announcement_id: uuid.UUID, session: DbSession, principal: PrincipalDep):
    from app.modules.academic.models import Announcement

    a = session.get(Announcement, announcement_id)
    if a is None:
        raise NotFoundError("Aviso no encontrado")
    if principal.role_code == "teacher" and a.author_id != principal.user_id:
        raise PermissionDeniedError("Sin acceso")
    svc.delete_announcement(session, a)
    return {"ok": True}


# ---------- Progress ----------
@router.get("/progress", response_model=list[ProgressOut])
def list_progress(session: DbSession, principal: PrincipalDep, student_id: uuid.UUID | None = None, lesson_id: uuid.UUID | None = None):
    if principal.role_code == "student":
        student_id = principal.user_id
    return svc.list_progress(session, student_id=student_id, lesson_id=lesson_id)


@router.post("/progress", response_model=ProgressOut)
def update_progress(payload: ProgressUpdate, session: DbSession, principal: PrincipalDep):
    if principal.role_code == "student" and payload.student_id != principal.user_id:
        raise PermissionDeniedError("Sin acceso")
    return svc.upsert_progress(session, payload.student_id, payload.lesson_id, payload.completed, payload.progress_pct)


# ---------- Activity ----------
@router.get("/activity", response_model=list[dict])
def list_activity(session: DbSession, principal: PrincipalDep, limit: int = 20, user_id: uuid.UUID | None = None):
    if principal.role_code not in ("admin", "editor"):
        user_id = principal.user_id
    acts = svc.list_activity(session, limit=limit, user_id=user_id)
    return [
        {"id": str(a.id), "user_id": str(a.user_id) if a.user_id else None, "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id, "details": a.details, "created_at": a.created_at.isoformat()}
        for a in acts
    ]


# ---------- Dashboard stats ----------
@router.get("/stats/dashboard", response_model=DashboardStats)
def dashboard_stats(session: DbSession, principal: PrincipalDep):
    return svc.dashboard_stats(session)


# ---------- Users for selection (students/teachers) ----------
@router.get("/people/students", response_model=list[dict])
def list_students(session: DbSession, principal: PrincipalDep, search: str | None = None):
    from app.modules.identity.models import User

    stmt = session.query(User) if False else None
    from sqlalchemy import select

    q = select(User).where(User.role_code == "student", User.active == True)
    if search:
        like = f"%{search}%"
        q = q.where(User.full_name.ilike(like) | User.email.ilike(like))
    users = list(session.execute(q.order_by(User.full_name)).scalars().all())
    return [{"id": str(u.id), "full_name": u.full_name, "email": u.email} for u in users]


@router.get("/people/teachers", response_model=list[dict])
def list_teachers(session: DbSession, principal: PrincipalDep, search: str | None = None):
    from app.modules.identity.models import User
    from sqlalchemy import select

    q = select(User).where(User.role_code == "teacher", User.active == True)
    if search:
        like = f"%{search}%"
        q = q.where(User.full_name.ilike(like) | User.email.ilike(like))
    users = list(session.execute(q.order_by(User.full_name)).scalars().all())
    return [{"id": str(u.id), "full_name": u.full_name, "email": u.email} for u in users]


def _has_perm(principal, perm):
    from app.core.permissions import has_permission

    return has_permission(list(principal.permissions), perm)
