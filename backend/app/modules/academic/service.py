from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, ConflictError, BusinessRuleError, PermissionDeniedError
from app.modules.academic.models import (
    ActivityLog,
    Announcement,
    Classroom,
    ClassroomEnrollment,
    ContentUnit,
    Course,
    CourseCategory,
    CourseEnrollment,
    Grade,
    Lesson,
    LessonProgress,
    Resource,
    TeacherAssignment,
)
from app.modules.identity.models import User


# ---------- helpers ----------
def _get(session: Session, model, obj_id):
    obj = session.get(model, obj_id)
    if obj is None:
        raise NotFoundError(f"{model.__name__} no encontrado")
    return obj


# ---------- Courses ----------
def list_courses(session, status=None, search=None, teacher_id=None):
    stmt = select(Course)
    if status:
        stmt = stmt.where(Course.status == status)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(Course.name.ilike(like) | Course.code.ilike(like))
    if teacher_id:
        stmt = stmt.where(Course.responsible_teacher_id == teacher_id)
    return list(session.execute(stmt.order_by(Course.created_at.desc())).scalars().all())


def get_course(session, course_id):
    return _get(session, Course, course_id)


def create_course(session, data, created_by=None):
    if session.execute(select(Course).where(Course.code == data.code)).scalar_one_or_none():
        raise ConflictError("Ya existe un curso con ese código")
    c = Course(**data.model_dump(), created_by=created_by)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def update_course(session, course, data):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(course, k, v)
    session.commit()
    session.refresh(course)
    return course


def delete_course(session, course):
    session.delete(course)
    session.commit()


# ---------- Categories ----------
def list_categories(session):
    return list(session.execute(select(CourseCategory).order_by(CourseCategory.name)).scalars().all())


def create_category(session, data):
    c = CourseCategory(**data.model_dump())
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


# ---------- Classrooms ----------
def list_classrooms(session, course_id=None, teacher_id=None):
    stmt = select(Classroom)
    if course_id:
        stmt = stmt.where(Classroom.course_id == course_id)
    if teacher_id:
        stmt = stmt.where(Classroom.teacher_id == teacher_id)
    return list(session.execute(stmt.order_by(Classroom.created_at.desc())).scalars().all())


def get_classroom(session, classroom_id):
    return _get(session, Classroom, classroom_id)


def create_classroom(session, data):
    # validate course exists
    course = session.get(Course, data.course_id)
    if course is None:
        raise NotFoundError("Curso no encontrado")
    cr = Classroom(**data.model_dump())
    session.add(cr)
    session.commit()
    session.refresh(cr)
    return cr


def update_classroom(session, classroom, data):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(classroom, k, v)
    session.commit()
    session.refresh(classroom)
    return classroom


def delete_classroom(session, classroom):
    session.delete(classroom)
    session.commit()


# ---------- Units ----------
def list_units(session, classroom_id):
    stmt = select(ContentUnit).where(ContentUnit.classroom_id == classroom_id).order_by(ContentUnit.order_index)
    return list(session.execute(stmt).scalars().all())


def get_unit(session, unit_id):
    return _get(session, ContentUnit, unit_id)


def create_unit(session, data):
    classroom = session.get(Classroom, data.classroom_id)
    if classroom is None:
        raise NotFoundError("Aula no encontrada")
    u = ContentUnit(**data.model_dump())
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def update_unit(session, unit, data):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(unit, k, v)
    session.commit()
    session.refresh(unit)
    return unit


def delete_unit(session, unit):
    session.delete(unit)
    session.commit()


# ---------- Lessons ----------
def list_lessons(session, unit_id):
    stmt = select(Lesson).where(Lesson.unit_id == unit_id).order_by(Lesson.order_index)
    return list(session.execute(stmt).scalars().all())


def get_lesson(session, lesson_id):
    return _get(session, Lesson, lesson_id)


def create_lesson(session, data, author_id=None):
    unit = session.get(ContentUnit, data.unit_id)
    if unit is None:
        raise NotFoundError("Unidad no encontrada")
    l = Lesson(**data.model_dump(), author_id=author_id)
    if l.status == "published" and l.published_at is None:
        l.published_at = datetime.now()
    session.add(l)
    session.commit()
    session.refresh(l)
    return l


def update_lesson(session, lesson, data):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(lesson, k, v)
    if lesson.status == "published" and lesson.published_at is None:
        lesson.published_at = datetime.now()
    session.commit()
    session.refresh(lesson)
    return lesson


def delete_lesson(session, lesson):
    session.delete(lesson)
    session.commit()


# ---------- Resources ----------
def list_resources(session, lesson_id=None, classroom_id=None, course_id=None):
    stmt = select(Resource)
    if lesson_id:
        stmt = stmt.where(Resource.lesson_id == lesson_id)
    if classroom_id:
        stmt = stmt.where(Resource.classroom_id == classroom_id)
    if course_id:
        stmt = stmt.where(Resource.course_id == course_id)
    return list(session.execute(stmt.order_by(Resource.order_index)).scalars().all())


def get_resource(session, resource_id):
    return _get(session, Resource, resource_id)


def create_resource(session, data, created_by=None):
    r = Resource(**data.model_dump(), created_by=created_by)
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


def update_resource(session, resource, data):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(resource, k, v)
    session.commit()
    session.refresh(resource)
    return resource


def delete_resource(session, resource):
    session.delete(resource)
    session.commit()


# ---------- Enrollments ----------
def enroll_course(session, student_id, course_id):
    existing = session.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.student_id == student_id, CourseEnrollment.course_id == course_id
        )
    ).scalar_one_or_none()
    if existing:
        raise ConflictError("El estudiante ya está inscrito en el curso")
    e = CourseEnrollment(student_id=student_id, course_id=course_id)
    session.add(e)
    session.commit()
    session.refresh(e)
    return e


def unenroll_course(session, enrollment_id):
    e = session.get(CourseEnrollment, enrollment_id)
    if e is None:
        raise NotFoundError("Inscripción no encontrada")
    session.delete(e)
    session.commit()


def list_course_enrollments(session, course_id=None, student_id=None):
    stmt = select(CourseEnrollment)
    if course_id:
        stmt = stmt.where(CourseEnrollment.course_id == course_id)
    if student_id:
        stmt = stmt.where(CourseEnrollment.student_id == student_id)
    return list(session.execute(stmt).scalars().all())


def enroll_classroom(session, student_id, classroom_id):
    existing = session.execute(
        select(ClassroomEnrollment).where(
            ClassroomEnrollment.student_id == student_id, ClassroomEnrollment.classroom_id == classroom_id
        )
    ).scalar_one_or_none()
    if existing:
        raise ConflictError("El estudiante ya pertenece al aula")
    # cupo check
    classroom = session.get(Classroom, classroom_id)
    if classroom and classroom.max_capacity:
        count = session.execute(
            select(func.count()).select_from(ClassroomEnrollment).where(ClassroomEnrollment.classroom_id == classroom_id)
        ).scalar()
        if count >= classroom.max_capacity:
            raise BusinessRuleError("El aula ha alcanzado su cupo máximo")
    e = ClassroomEnrollment(student_id=student_id, classroom_id=classroom_id)
    session.add(e)
    session.commit()
    session.refresh(e)
    return e


def unenroll_classroom(session, enrollment_id):
    e = session.get(ClassroomEnrollment, enrollment_id)
    if e is None:
        raise NotFoundError("Asignación no encontrada")
    session.delete(e)
    session.commit()


def list_classroom_enrollments(session, classroom_id=None, student_id=None):
    stmt = select(ClassroomEnrollment)
    if classroom_id:
        stmt = stmt.where(ClassroomEnrollment.classroom_id == classroom_id)
    if student_id:
        stmt = stmt.where(ClassroomEnrollment.student_id == student_id)
    return list(session.execute(stmt).scalars().all())


# ---------- Teacher assignments ----------
def assign_teacher(session, teacher_id, course_id=None, classroom_id=None, role="primary"):
    ta = TeacherAssignment(teacher_id=teacher_id, course_id=course_id, classroom_id=classroom_id, role=role)
    session.add(ta)
    session.commit()
    session.refresh(ta)
    return ta


def list_teacher_assignments(session, teacher_id=None, course_id=None, classroom_id=None):
    stmt = select(TeacherAssignment)
    if teacher_id:
        stmt = stmt.where(TeacherAssignment.teacher_id == teacher_id)
    if course_id:
        stmt = stmt.where(TeacherAssignment.course_id == course_id)
    if classroom_id:
        stmt = stmt.where(TeacherAssignment.classroom_id == classroom_id)
    return list(session.execute(stmt).scalars().all())


def remove_teacher_assignment(session, assignment_id):
    ta = session.get(TeacherAssignment, assignment_id)
    if ta is None:
        raise NotFoundError("Asignación no encontrada")
    session.delete(ta)
    session.commit()


# ---------- Grades ----------
def list_grades(session, student_id=None, classroom_id=None):
    stmt = select(Grade)
    if student_id:
        stmt = stmt.where(Grade.student_id == student_id)
    if classroom_id:
        stmt = stmt.where(Grade.classroom_id == classroom_id)
    return list(session.execute(stmt.order_by(Grade.graded_at.desc())).scalars().all())


def get_grade(session, grade_id):
    return _get(session, Grade, grade_id)


def create_grade(session, data, graded_by=None):
    score = float(data.score)
    max_score = float(data.max_score)
    if score < 0 or score > max_score:
        raise BusinessRuleError("La calificación debe estar entre 0 y el máximo permitido")
    g = Grade(**data.model_dump(), graded_by=graded_by)
    session.add(g)
    session.commit()
    session.refresh(g)
    return g


def update_grade(session, grade, data):
    if data.score is not None:
        score = float(data.score)
        max_score = float(data.max_score) if data.max_score is not None else float(grade.max_score)
        if score < 0 or score > max_score:
            raise BusinessRuleError("La calificación debe estar entre 0 y el máximo permitido")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(grade, k, v)
    session.commit()
    session.refresh(grade)
    return grade


def delete_grade(session, grade):
    session.delete(grade)
    session.commit()


# ---------- Announcements ----------
def list_announcements(session, course_id=None, classroom_id=None, target_role=None):
    stmt = select(Announcement)
    if course_id:
        stmt = stmt.where(Announcement.course_id == course_id)
    if classroom_id:
        stmt = stmt.where(Announcement.classroom_id == classroom_id)
    if target_role:
        stmt = stmt.where((Announcement.target_role == target_role) | (Announcement.target_role.is_(None)))
    return list(session.execute(stmt.order_by(Announcement.published_at.desc())).scalars().all())


def create_announcement(session, data, author_id=None):
    a = Announcement(**data.model_dump(), author_id=author_id)
    session.add(a)
    session.commit()
    session.refresh(a)
    return a


def delete_announcement(session, ann):
    session.delete(ann)
    session.commit()


# ---------- Progress ----------
def upsert_progress(session, student_id, lesson_id, completed=False, progress_pct=0):
    lp = session.execute(
        select(LessonProgress).where(LessonProgress.student_id == student_id, LessonProgress.lesson_id == lesson_id)
    ).scalar_one_or_none()
    if lp is None:
        lp = LessonProgress(student_id=student_id, lesson_id=lesson_id, completed=completed, progress_pct=progress_pct, last_viewed_at=datetime.now())
        session.add(lp)
    else:
        lp.completed = completed
        lp.progress_pct = progress_pct
        lp.last_viewed_at = datetime.now()
    session.commit()
    session.refresh(lp)
    return lp


def list_progress(session, student_id=None, lesson_id=None):
    stmt = select(LessonProgress)
    if student_id:
        stmt = stmt.where(LessonProgress.student_id == student_id)
    if lesson_id:
        stmt = stmt.where(LessonProgress.lesson_id == lesson_id)
    return list(session.execute(stmt).scalars().all())


# ---------- Activity ----------
def log_activity(session, user_id, action, entity_type, entity_id=None, details=None):
    al = ActivityLog(user_id=user_id, action=action, entity_type=entity_type, entity_id=str(entity_id) if entity_id else None, details=details)
    session.add(al)
    session.commit()


def list_activity(session, limit=20, user_id=None):
    stmt = select(ActivityLog)
    if user_id:
        stmt = stmt.where(ActivityLog.user_id == user_id)
    stmt = stmt.order_by(ActivityLog.created_at.desc()).limit(limit)
    return list(session.execute(stmt).scalars().all())


# ---------- Stats ----------
def dashboard_stats(session):
    from app.modules.identity.models import User

    total_students = session.execute(select(func.count()).select_from(User).where(User.role_code == "student")).scalar() or 0
    total_teachers = session.execute(select(func.count()).select_from(User).where(User.role_code == "teacher")).scalar() or 0
    total_courses = session.execute(select(func.count()).select_from(Course)).scalar() or 0
    total_classrooms = session.execute(select(func.count()).select_from(Classroom)).scalar() or 0
    active_courses = session.execute(select(func.count()).select_from(Course).where(Course.status == "active")).scalar() or 0
    finished_courses = session.execute(select(func.count()).select_from(Course).where(Course.status == "finished")).scalar() or 0
    total_enrollments = session.execute(select(func.count()).select_from(CourseEnrollment)).scalar() or 0
    recent = list_activity(session, limit=8)
    recent_out = [
        {"id": str(a.id), "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id, "created_at": a.created_at.isoformat(), "user_id": str(a.user_id) if a.user_id else None}
        for a in recent
    ]
    return {
        "total_students": total_students,
        "total_teachers": total_teachers,
        "total_courses": total_courses,
        "total_classrooms": total_classrooms,
        "active_courses": active_courses,
        "finished_courses": finished_courses,
        "total_enrollments": total_enrollments,
        "recent_activity": recent_out,
    }


# ---------- ownership helpers ----------
def teacher_owns_classroom(session, teacher_id, classroom_id) -> bool:
    cr = session.get(Classroom, classroom_id)
    if cr is None:
        return False
    if cr.teacher_id == teacher_id:
        return True
    # check teacher assignments
    ta = session.execute(
        select(TeacherAssignment).where(
            TeacherAssignment.teacher_id == teacher_id, TeacherAssignment.classroom_id == classroom_id
        )
    ).scalar_one_or_none()
    return ta is not None


def teacher_owns_course(session, teacher_id, course_id) -> bool:
    course = session.get(Course, course_id)
    if course is None:
        return False
    if course.responsible_teacher_id == teacher_id:
        return True
    ta = session.execute(
        select(TeacherAssignment).where(TeacherAssignment.teacher_id == teacher_id, TeacherAssignment.course_id == course_id)
    ).scalar_one_or_none()
    return ta is not None


def student_enrolled_course(session, student_id, course_id) -> bool:
    e = session.execute(
        select(CourseEnrollment).where(CourseEnrollment.student_id == student_id, CourseEnrollment.course_id == course_id)
    ).scalar_one_or_none()
    return e is not None


def student_in_classroom(session, student_id, classroom_id) -> bool:
    e = session.execute(
        select(ClassroomEnrollment).where(ClassroomEnrollment.student_id == student_id, ClassroomEnrollment.classroom_id == classroom_id)
    ).scalar_one_or_none()
    return e is not None
