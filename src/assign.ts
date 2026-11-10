import type { Assignment } from "./db.js";
import { collections } from "./db.js"
import { ObjectId } from "mongodb";

export type AssignResult =
  | { kind: "assigned"; assignment: Assignment }
  | { kind: "judge-busy" } // the judge already holds a QUEUED assignment
  | { kind: "none-available" }; // no project is eligible for this judge right now

/**
 * TODO: implement. See the README for the rules.
 *
 * `judgeId` is already validated to exist by the route. Use `collections()` from ./db.js.
 * Add any helpers you need.
 */
export async function assignNext(judgeId: string): Promise<AssignResult> {
  const {projects, assignments} = collections();
  //current assignments
  const judgeAssignments = await assignments.find({judgeId}).toArray();
  const isBusy = judgeAssignments.some((assignment) => assignment.status == "QUEUED");

  //if judge is busy
  if (isBusy) {
    return {kind: "judge-busy"}
  }

  //projects
  const judgeProjects = await projects.find().toArray();

  //queued by other judges
  const queuedByOtherJudges = await assignments.find({
    status: "QUEUED",
    judgeId: { $ne: judgeId},
  }).toArray();
  const projectIdsInUse = queuedByOtherJudges.map((assignment) => assignment.projectId);

  //previously assigned projects
  const previouslyAssignedProjectIds = judgeAssignments.map((assignment) => assignment.projectId);

  //filter projects
  const availableProjects = judgeProjects.filter((project) => !projectIdsInUse.includes(project._id) &&
    !previouslyAssignedProjectIds.includes(project._id));


  if (availableProjects.length == 0){
    return ({kind: "none-available"});
  }

  //completed assignments
  const completedAssignments = await assignments.find({ status: "COMPLETED"}).toArray();
  const completedCounts = new Map<string, number>();

  for (const assignment of completedAssignments) {
    const countSoFar = completedCounts.get(assignment.projectId) ?? 0;
    completedCounts.set(assignment.projectId, countSoFar + 1);
  }

  //find lowest count
  const fewestCompleted = Math.min( ...availableProjects.map((project) => completedCounts.get(project._id) ?? 0));

  const leastJudgedProjects = availableProjects.filter( (project) => (completedCounts.get(project._id) ?? 0) == fewestCompleted);

  //randomly assign
  const randomIndex = Math.floor(Math.random() * leastJudgedProjects.length);
  const chosenProject = leastJudgedProjects[randomIndex];

  const newAssignment = {
    _id: new ObjectId(),
    judgeId,
    projectId: chosenProject._id,
    status: "QUEUED" as const,
    createdAt: new Date(),
  };

  const result = await assignments.insertOne(newAssignment);

  return {
    kind: "assigned",
    assignment: { ...newAssignment, _id: result.insertedId},
  };
}
